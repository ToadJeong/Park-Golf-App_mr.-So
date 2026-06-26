import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Coordinate conversion function (GPS to KMA Grid)
function dfs_xy_conv(lat: number, lon: number) {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0; // 투영 위도1(degree)
  const SLAT2 = 60.0; // 투영 위도2(degree)
  const OLON = 126.0; // 기준점 경도(degree)
  const OLAT = 38.0; // 기준점 위도(degree)
  const XO = 43; // 기준점 X좌표(grid)
  const YO = 136; // 기준점 Y좌표(grid)

  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  
  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

// Get base date and time for KMA API
function getKMABaseTime() {
  const now = new Date();
  // Convert UTC to KST (UTC+9)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (3600000 * 9));

  let year = kst.getFullYear();
  let month = kst.getMonth() + 1;
  let date = kst.getDate();
  let hour = kst.getHours();
  let minute = kst.getMinutes();

  // KMA updates Ultra-Short-Term Status around minute 40
  if (minute < 40) {
    hour -= 1;
    if (hour < 0) {
      hour = 23;
      const prevDay = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
      year = prevDay.getFullYear();
      month = prevDay.getMonth() + 1;
      date = prevDay.getDate();
    }
  }

  const baseDate = `${year}${String(month).padStart(2, '0')}${String(date).padStart(2, '0')}`;
  const baseTime = `${String(hour).padStart(2, '0')}00`;

  return { baseDate, baseTime };
}

app.use(express.json());

// API route for weather proxy
app.get("/api/weather", async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Latitude (lat) and Longitude (lon) are required." });
  }

  const latitude = parseFloat(lat as string);
  const longitude = parseFloat(lon as string);

  let temp: number | null = null;
  let source = "none";
  let locationName = "내 위치 (실시간)";

  // 1. Try reverse geocoding with OpenStreetMap Nominatim (optional, with 1.5s timeout)
  try {
    const geoController = new AbortController();
    const timeoutId = setTimeout(() => geoController.abort(), 1500);

    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1`,
      {
        headers: { "User-Agent": "SingsingSafetyApp/1.0 (jws.wonseok@gmail.com)" },
        signal: geoController.signal,
      }
    );
    clearTimeout(timeoutId);

    if (geoRes.ok) {
      const geoData: any = await geoRes.json();
      if (geoData && geoData.address) {
        const addr = geoData.address;
        // Build a friendly Korean location name from address
        const province = addr.province || addr.state || "";
        const city = addr.city || addr.town || addr.borough || addr.district || "";
        const village = addr.suburb || addr.neighbourhood || addr.village || "";
        
        if (province || city) {
          locationName = `${province} ${city} ${village}`.trim();
        }
      }
    }
  } catch (e) {
    console.log("Nominatim reverse geocode failed or timed out. Falling back to default name.");
  }

  // 2. If KMA service key is present, try KMA first
  const kmaKey = process.env.KMA_SERVICE_KEY;
  if (kmaKey) {
    try {
      const { nx, ny } = dfs_xy_conv(latitude, longitude);
      const { baseDate, baseTime } = getKMABaseTime();

      console.log(`KMA API request: nx=${nx}, ny=${ny}, baseDate=${baseDate}, baseTime=${baseTime}`);

      // We use decoded or encoded key depending on how it was passed.
      const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${encodeURIComponent(
        kmaKey
      )}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data: any = await response.json();
        const items = data?.response?.body?.items?.item;
        if (items && Array.isArray(items)) {
          const t1hItem = items.find((item: any) => item.category === "T1H");
          if (t1hItem && t1hItem.obsrValue) {
            temp = parseFloat(t1hItem.obsrValue);
            source = "기상청 (KMA)";
          }
        } else {
          console.warn("KMA response items not found or invalid format:", JSON.stringify(data));
        }
      } else {
        console.warn("KMA API returned non-OK status:", response.status);
      }
    } catch (err) {
      console.error("KMA API fetch failed:", err);
    }
  }

  // 3. Fallback to Open-Meteo if KMA didn't return a value
  if (temp === null) {
    try {
      const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`;
      const response = await fetch(openMeteoUrl);
      if (response.ok) {
        const data: any = await response.json();
        if (data && data.current && typeof data.current.temperature_2m === "number") {
          temp = Math.round(data.current.temperature_2m * 10) / 10;
          source = "Open-Meteo";
        }
      }
    } catch (err) {
      console.error("Open-Meteo API fetch failed:", err);
    }
  }

  // 4. Ultimate hardcoded mock temperature fallback based on current date
  if (temp === null) {
    const currentMonth = new Date().getMonth();
    temp = (currentMonth >= 5 && currentMonth <= 7) ? 31.4 : 23.8;
    source = "Fallback (예상값)";
  }

  return res.json({
    temp,
    locationName,
    source,
    lat: latitude,
    lon: longitude
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
