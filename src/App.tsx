import React, { useState, useEffect, useRef } from "react";
import { 
  Sun, 
  MapPin, 
  Navigation, 
  RotateCcw, 
  Play, 
  Pause, 
  PhoneCall, 
  Droplet, 
  Timer, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  Sparkles,
  Volume2,
  RefreshCw,
  Sliders,
  BellRing,
  Minus,
  Plus,
  RotateCw,
  Award
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getWeatherDirect } from "./utils/weather";


export default function App() {
  // --- 날씨 및 온도 관리 상태 ---
  const [isRealMode, setIsRealMode] = useState<boolean>(false);
  const [virtualTemp, setVirtualTemp] = useState<number>(32);
  const [realWeather, setRealWeather] = useState<{
    temp: number;
    locationName: string;
    source: string;
    lat?: number;
    lon?: number;
  } | null>(null);
  
  const [locationLoading, setLocationLoading] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // 현재 적용되는 온도
  const temp = isRealMode ? (realWeather ? realWeather.temp : 32) : virtualTemp;

  // --- 물 마시기 알람 상태 ---
  const [waterOn, setWaterOn] = useState<boolean>(false);
  const [waterMode, setWaterMode] = useState<"standard" | "custom">("standard"); // standard: 30분, custom: 지정 시간
  const [customWaterMin, setCustomWaterMin] = useState<number>(1); // 사용자 직접 설정 (분) - 기본 1분
  const [customWaterSec, setCustomWaterSec] = useState<number>(0); // 사용자 직접 설정 (초) - 기본 0초

  // 실제 타이머용 계산 한도 (초 단위)
  const waterLimit = waterMode === "standard" ? 1800 : (customWaterMin * 60 + customWaterSec);
  const [waterSec, setWaterSec] = useState<number>(1800); 

  // 물 마시기 알림 반복 횟수 설정 (0: 무제한, 1~10회)
  const [waterRepeatTarget, setWaterRepeatTarget] = useState<number>(0); 
  const [waterAlertCount, setWaterAlertCount] = useState<number>(0); // 지금까지 울린 횟수
  const waterIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 파크골프 휴식 타이머 상태 ---
  const [golfOn, setGolfOn] = useState<boolean>(false);
  const [golfMode, setGolfMode] = useState<"standard" | "custom">("standard"); // standard: 1시간, custom: 지정 시간
  const [customGolfMin, setCustomGolfMin] = useState<number>(10); // 사용자 직접 설정 (분) - 기본 10분
  const [customGolfSec, setCustomGolfSec] = useState<number>(0); // 사용자 직접 설정 (초) - 기본 0초

  // 실제 타이머용 계산 한도 (초 단위)
  const golfLimit = golfMode === "standard" ? 3600 : (customGolfMin * 60 + customGolfSec);
  const [golfSec, setGolfSec] = useState<number>(0); 

  // 휴식 타이머 알림 반복 횟수 설정 (0: 무제한, 1~10회)
  const [golfRepeatTarget, setGolfRepeatTarget] = useState<number>(0); 
  const [golfAlertCount, setGolfAlertCount] = useState<number>(0); // 지금까지 쉬어간 횟수
  const golfIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 맞춤형 팝업 모달 알림 상태 ---
  const [alertModal, setAlertModal] = useState<{
    type: "water" | "rest";
    title: string;
    message: string;
    count: number;
    target: number;
  } | null>(null);

  // --- 가상 온도 조절 ---
  const changeTemp = (val: number) => {
    if (!isRealMode) {
      setVirtualTemp((prev) => prev + val);
    }
  };

  // --- 안드로이드 햅틱 진동 효과 ---
  const triggerVibration = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      // 진동 0.3초 -> 쉬고 0.1초 -> 진동 0.3초 -> 쉬고 0.1초 -> 진동 0.5초 (안드로이드 친화적 경고)
      navigator.vibrate([300, 100, 300, 100, 500]);
    }
  };

  // --- 어르신 친화적 솔-미 (Sol-Mi) 알림 방송용 차임벨 사운드 (Web Audio API) ---
  const playAlarmSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0.4, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(start);
        osc.stop(start + duration);
      };

      // 기분 좋은 솔(784Hz) - 미(659Hz) 2음 연속벨 연주
      playTone(783.99, ctx.currentTime, 0.4); 
      playTone(659.25, ctx.currentTime + 0.35, 0.6); 
    } catch (err) {
      console.error("사운드 재생 실패:", err);
    }
  };

  // --- 실시간 날씨 파악 (기상청/Open-Meteo 직접 연동) ---
  const fetchRealTimeWeather = () => {
    if (!navigator.geolocation) {
      setLocationError("이 휴대폰에서 위치 권한/GPS 서비스를 지원하지 않습니다.");
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const data = await getWeatherDirect(latitude, longitude);
          setRealWeather({
            temp: data.temp,
            locationName: data.locationName || "내 위치 주변 파크골프장",
            source: data.source,
            lat: data.lat,
            lon: data.lon
          });
        } catch (err: any) {
          console.error(err);
          setLocationError("인근 날씨 정보를 연결하는 데 실패했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
          setLocationLoading(false);
        }
      },
      (error) => {
        console.error(error);
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("위치 접근 권한이 거부되었습니다. 휴대폰의 브라우저 위치 권한을 확인해주세요.");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("GPS 신호를 잡을 수 없습니다. 휴대폰에서 GPS/위치 기능을 활성화해주세요.");
            break;
          case error.TIMEOUT:
            setLocationError("위치 정보를 가져오는 데 너무 오래 걸립니다. 다시 시도해주세요.");
            break;
          default:
            setLocationError("위치 측정을 시작할 수 없습니다. 모바일 데이터망 상태를 확인해 주세요.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  const enableRealMode = () => {
    setIsRealMode(true);
  };

  const enableVirtualMode = () => {
    setIsRealMode(false);
  };

  // 실시간 모드로 전환 시 자동 조회
  useEffect(() => {
    if (isRealMode && !realWeather) {
      fetchRealTimeWeather();
    }
  }, [isRealMode]);

  // --- 시간 설정 변경 시 타이머 자동 초기화 효과 ---
  useEffect(() => {
    if (!waterOn) {
      setWaterSec(waterLimit);
    }
  }, [waterLimit, waterOn]);

  useEffect(() => {
    if (!golfOn) {
      setGolfSec(0);
    }
  }, [golfLimit, golfOn]);


  // --- 1. 물 마시기 알람 정밀 타이머 효과 ---
  useEffect(() => {
    if (waterOn) {
      waterIntervalRef.current = setInterval(() => {
        setWaterSec((prev) => {
          if (prev <= 1) {
            // 시간 완료 시 행동 실행
            playAlarmSound();
            triggerVibration();
            
            // 횟수 누적
            let currentCount = 0;
            setWaterAlertCount((c) => {
              const nextCount = c + 1;
              currentCount = nextCount;
              return nextCount;
            });

            // React State 비동기 처리를 위한 지연 및 정확한 값 전달
            setTimeout(() => {
              const limitReached = waterRepeatTarget > 0 && currentCount >= waterRepeatTarget;

              setAlertModal({
                type: "water",
                title: limitReached 
                  ? "💧 물 마시기 알람 목표 달성!" 
                  : `💧 시원한 물 마시기 알람! (${currentCount}회차)`,
                message: limitReached
                  ? `🎉 오늘 설정하신 총 ${waterRepeatTarget}회 물 마시기 목표를 완료하셨습니다!\n충분한 수분을 섭취했으니 잠시 한숨 돌리고 타이머를 종료합니다.`
                  : `📢 꿀꺽꿀꺽! 벌써 설정하신 시간이 되었습니다!\n어르신의 생명수인 물을 한 잔 기분 좋게 들이키시고 라운딩을 계속하세요.`,
                count: currentCount,
                target: waterRepeatTarget
              });

              // 모바일 브라우저 백그라운드나 긴급 alert 보장
              alert(limitReached 
                ? `🎉 물 마시기 목표 (${waterRepeatTarget}회) 완료되어 타이머가 종료됩니다!`
                : `🚨 꿀꺽꿀꺽! 시원한 물을 한 잔 마실 시간입니다! (${currentCount}회차)`
              );

              if (limitReached) {
                setWaterOn(false);
              }
            }, 100);

            return waterLimit; // 다음 반복 주기로 재생성
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (waterIntervalRef.current) {
        clearInterval(waterIntervalRef.current);
      }
    }

    return () => {
      if (waterIntervalRef.current) {
        clearInterval(waterIntervalRef.current);
      }
    };
  }, [waterOn, waterLimit, waterRepeatTarget]);


  // 물 마시기 시작/중단 토글
  const toggleWater = () => {
    if (!waterOn) {
      setWaterSec(waterLimit);
      setWaterOn(true);
    } else {
      setWaterOn(false);
    }
  };

  // 물 마시기 초기화
  const resetWater = () => {
    setWaterOn(false);
    setWaterSec(waterLimit);
    setWaterAlertCount(0);
  };

  // 물 마시기 알림 주기 방식 선택
  const changeWaterMode = (mode: "standard" | "custom") => {
    setWaterOn(false);
    setWaterMode(mode);
    setWaterAlertCount(0);
  };

  // 직접 설정한 물 마시기 시간 조절 헬퍼
  const adjustCustomWater = (amountSec: number) => {
    let currentTotal = customWaterMin * 60 + customWaterSec;
    let nextTotal = currentTotal + amountSec;
    
    // 최소 시간 10초로 보장
    if (nextTotal < 10) nextTotal = 10;
    
    setCustomWaterMin(Math.floor(nextTotal / 60));
    setCustomWaterSec(nextTotal % 60);
  };

  // --- 2. 파크골프 휴식 타이머 정밀 카운트 효과 ---
  useEffect(() => {
    if (golfOn) {
      golfIntervalRef.current = setInterval(() => {
        setGolfSec((prev) => {
          const nextVal = prev + 1;
          if (nextVal >= golfLimit) {
            playAlarmSound();
            triggerVibration();

            let currentCount = 0;
            setGolfAlertCount((c) => {
              const nextCount = c + 1;
              currentCount = nextCount;
              return nextCount;
            });

            setTimeout(() => {
              const limitReached = golfRepeatTarget > 0 && currentCount >= golfRepeatTarget;

              setAlertModal({
                type: "rest",
                title: limitReached 
                  ? "⏱️ 오늘 운동 목표치 달성!" 
                  : `⏱️ 나무 그늘 휴식 시간! (${currentCount}회차)`,
                message: limitReached
                  ? `🎉 오늘 계획하신 운동 및 휴식 ${golfRepeatTarget}회를 모두 완료하셨습니다!\n어르신, 대단하십니다! 몸에 무리가 가지 않도록 이제 짐을 정리하고 서서히 귀가하세요.`
                  : `📢 어르신, 열심히 운동하신 지 ${Math.floor(golfLimit / 60)}분이 지났습니다!\n열사병을 미리 막기 위해, 지금 채를 내려놓으시고 나무 그늘 아래에서 시원한 대화를 나누며 꼭 10분 쉬세요.`,
                count: currentCount,
                target: golfRepeatTarget
              });

              alert(limitReached 
                ? `⛳ 오늘 설정하신 운동량(${golfRepeatTarget}회 반복)을 모두 이행하셨습니다! 휴식 타이머가 자동 종료됩니다.`
                : `📢 열심히 치셨습니다! 이제 나무 그늘 아래에서 꼭 쉬어주세요! (${currentCount}회차)`
              );

              if (limitReached) {
                setGolfOn(false);
              }
            }, 100);

            return 0; // 다음 횟수 시작을 위해 0초로 리셋
          }
          return nextVal;
        });
      }, 1000);
    } else {
      if (golfIntervalRef.current) {
        clearInterval(golfIntervalRef.current);
      }
    }

    return () => {
      if (golfIntervalRef.current) {
        clearInterval(golfIntervalRef.current);
      }
    };
  }, [golfOn, golfLimit, golfRepeatTarget]);

  // 골프 타이머 토글
  const toggleGolf = () => {
    setGolfOn((prev) => !prev);
  };

  // 골프 타이머 리셋
  const resetGolf = () => {
    setGolfOn(false);
    setGolfSec(0);
    setGolfAlertCount(0);
  };

  // 골프 타이머 시간 주기 변경
  const changeGolfMode = (mode: "standard" | "custom") => {
    setGolfOn(false);
    setGolfMode(mode);
    setGolfAlertCount(0);
    setGolfSec(0);
  };

  // 직접 설정한 골프 시간 조절 헬퍼
  const adjustCustomGolf = (amountSec: number) => {
    let currentTotal = customGolfMin * 60 + customGolfSec;
    let nextTotal = currentTotal + amountSec;
    
    // 최소 시간 10초 보장
    if (nextTotal < 10) nextTotal = 10;

    setCustomGolfMin(Math.floor(nextTotal / 60));
    setCustomGolfSec(nextTotal % 60);
  };


  // --- 시간 포맷 변환 및 표시값 계산 ---
  const mWater = Math.floor(waterSec / 60);
  const sWater = waterSec % 60;

  const hGolf = Math.floor(golfSec / 3600);
  const mGolf = Math.floor((golfSec % 3600) / 60);
  const sGolf = golfSec % 60;

  // 신호등 기온 위험 여부
  const isDangerous = temp >= 30;

  return (
    <div className="bg-slate-50 text-slate-900 pb-24 font-sans min-h-screen selection:bg-blue-200 break-keep">
      
      {/* 1. 상단 온도 신호등 판넬 */}
      <motion.div 
        id="temp-bg" 
        layout
        className={`py-8 sm:py-12 px-4 sm:px-6 transition-all duration-700 text-white shadow-lg ${
          isDangerous 
            ? "bg-gradient-to-b from-red-600 via-red-600 to-red-700" 
            : "bg-gradient-to-b from-emerald-600 via-emerald-600 to-emerald-700"
        }`}
      >
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex justify-center items-center gap-2 mb-2">
            <span className="bg-white/20 px-3 py-1 rounded-full text-xs sm:text-sm font-bold tracking-wider">
              👴 어르신 안전 지킴이 👵
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black mb-4 tracking-tight drop-shadow-md">
            여름철 쌩쌩 안전 앱
          </h1>
          
          <p className="text-sm sm:text-base opacity-90 mb-6 font-medium">
            파크골프장 기온을 확인하고 안전 수칙에 맞춰 시원하게 운동하세요!
          </p>

          {/* 실시간 기온 및 구역 표시 카드 */}
          <div className="bg-black/25 backdrop-blur-md rounded-3xl p-5 sm:p-7 mb-6 border border-white/10 shadow-inner">
            <div className="text-base sm:text-lg font-semibold opacity-90 mb-1 flex justify-center items-center gap-1.5">
              <MapPin className="w-5 h-5 text-yellow-300 animate-bounce" />
              {isRealMode ? (
                <span>{realWeather?.locationName || "위치 측정 중..."}</span>
              ) : (
                <span>온도 설정 파크골프장</span>
              )}
            </div>

            <div className="text-5xl sm:text-7xl font-black font-display my-3 flex justify-center items-baseline gap-1">
              <span id="temp" className="tracking-tight">{temp}</span>
              <span className="text-3xl sm:text-4xl font-sans">°C</span>
            </div>

            {/* 신호등 문구 */}
            <AnimatePresence mode="wait">
              <motion.div 
                key={isDangerous ? "danger" : "safe"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`text-base sm:text-xl font-bold py-3 px-4 rounded-xl mx-auto flex items-center justify-center gap-2 ${
                  isDangerous 
                    ? "bg-red-500/30 text-yellow-200 border border-red-500/20" 
                    : "bg-emerald-500/30 text-emerald-100 border border-emerald-500/20"
                }`}
              >
                {isDangerous ? (
                  <>
                    <AlertTriangle className="w-6 h-6 text-yellow-300 shrink-0" />
                    <span>⚠️ [위험] 30도가 넘었습니다!<br className="block sm:hidden" /> 물을 드시며 휴식하세요!</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-yellow-300 shrink-0" />
                    <span>✅ [안전] 야외 파크골프 치기 딱 좋은 기온입니다!</span>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {isRealMode && realWeather && (
              <p className="text-[11px] sm:text-xs opacity-75 mt-3">
                제공처: {realWeather.source} | 위도:{realWeather.lat?.toFixed(3)} 경도:{realWeather.lon?.toFixed(3)}
              </p>
            )}
          </div>

          {/* 기온 선택 버튼 (실시간 GPS vs 온도 설정) */}
          <div className="grid grid-cols-2 gap-2 bg-white/10 p-1.5 rounded-2xl max-w-md mx-auto">
            <button
              onClick={enableRealMode}
              className={`py-3 px-1.5 sm:px-3 rounded-xl font-bold text-xs sm:text-base flex justify-center items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                isRealMode 
                  ? "bg-white text-emerald-900 shadow-md scale-[1.02]" 
                  : "bg-transparent text-white hover:bg-white/5"
              }`}
            >
              <Navigation className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isRealMode ? "animate-spin" : ""}`} />
              📡 실시간 기온
            </button>
            <button
              onClick={enableVirtualMode}
              className={`py-3 px-1.5 sm:px-3 rounded-xl font-bold text-xs sm:text-base flex justify-center items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                !isRealMode 
                  ? "bg-white text-orange-950 shadow-md scale-[1.02]" 
                  : "bg-transparent text-white hover:bg-white/5"
              }`}
            >
              <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              ⚙️ 온도 설정
            </button>
          </div>

          {/* 온도 설정 조절기 */}
          <AnimatePresence>
            {!isRealMode && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-black/15 p-4 rounded-2xl max-w-md mx-auto mt-4 border border-white/5">
                  <div className="mb-2 text-sm sm:text-base font-bold flex items-center justify-center gap-1.5 text-yellow-300">
                    <Sparkles className="w-4 h-4" />
                    💡 기온을 직접 설정해 신호등 변화를 확인해보세요!
                  </div>
                  <div className="flex justify-center items-center gap-3">
                    <button 
                      onClick={() => changeTemp(-1)} 
                      className="bg-blue-500 hover:bg-blue-600 px-3 py-3.5 sm:px-6 sm:py-4 rounded-xl text-sm sm:text-lg font-black shadow-md active:scale-95 transition-transform cursor-pointer grow text-center whitespace-nowrap"
                    >
                      기온 내리기 (-)
                    </button>
                    <button 
                      onClick={() => changeTemp(1)} 
                      className="bg-orange-500 hover:bg-orange-600 px-3 py-3.5 sm:px-6 sm:py-4 rounded-xl text-sm sm:text-lg font-black shadow-md active:scale-95 transition-transform cursor-pointer grow text-center whitespace-nowrap"
                    >
                      기온 올리기 (+)
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 실시간 GPS 에러/로딩 */}
          <AnimatePresence>
            {isRealMode && (locationLoading || locationError) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-md mx-auto mt-4"
              >
                {locationLoading && (
                  <div className="bg-blue-500/20 backdrop-blur-md rounded-2xl p-4 flex justify-center items-center gap-3 border border-blue-500/30">
                    <RefreshCw className="w-5 h-5 animate-spin text-yellow-300" />
                    <span className="font-bold text-sm">내 휴대폰 GPS 실시간 위치 수신 중...</span>
                  </div>
                )}
                {locationError && (
                  <div className="bg-red-500/25 backdrop-blur-sm rounded-2xl p-4 border border-red-500/40 text-left">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-sm text-yellow-200">위치 정보를 찾지 못했습니다</h4>
                        <p className="text-xs text-slate-100 mt-1 leading-relaxed">{locationError}</p>
                        <button 
                          onClick={fetchRealTimeWeather} 
                          className="mt-2 text-xs bg-white text-red-900 px-3 py-1.5 rounded-lg font-black flex items-center gap-1 cursor-pointer active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          다시 시도하기
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* 2. 어르신 도우미 핵심 기둥 구역 */}
      <div className="max-w-2xl mx-auto px-4 mt-6">
        
        {/* 생명수 알람 (물 마시기) 카드 */}
        <div className="mb-6 bg-white p-5 sm:p-8 rounded-3xl border-4 border-blue-200 shadow-md text-left">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
              <Droplet className="w-7 h-7 fill-blue-500" />
            </div>
            <div>
              <h2 className="text-lg sm:text-3xl font-black text-blue-900 leading-tight flex flex-wrap items-center gap-x-1.5 break-keep">
                <span className="whitespace-nowrap">생명수 알람</span>
                <span className="text-sm sm:text-2xl text-blue-700 font-bold whitespace-nowrap">(물 마시기)</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-bold mt-1">탈수 예방을 위해 정기적으로 물 마시는 시간입니다.</p>
            </div>
          </div>

          {/* 물 마시기 모드 선택 (표준 30분 vs 내가 정한 시간) */}
          <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 mb-4 text-center">
            <span className="text-xs sm:text-sm font-black text-slate-500 block mb-2">알림 주기 선택</span>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => changeWaterMode("standard")}
                className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex justify-center items-center gap-1.5 ${
                  waterMode === "standard" 
                    ? "bg-blue-600 text-white shadow-md scale-[1.01]" 
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                표준 간격 (30분)
              </button>
              <button 
                onClick={() => changeWaterMode("custom")}
                className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex justify-center items-center gap-1.5 ${
                  waterMode === "custom" 
                    ? "bg-blue-600 text-white shadow-md scale-[1.01]" 
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                내가 정한 시간
              </button>
            </div>

            {/* 내가 정한 시간 설정 조절기 */}
            <AnimatePresence>
              {waterMode === "custom" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mt-3 pt-3 border-t border-blue-100"
                >
                  <p className="text-xs text-blue-900 font-black text-center mb-2">
                    👇 아래 버튼을 눌러 알림 주기를 마음대로 맞춰보세요!
                  </p>
                  
                  {/* 시간 표시 및 조절 버튼 */}
                  <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-blue-200 max-w-sm mx-auto mb-3">
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] font-bold text-slate-400">분(Min)</span>
                      <div className="flex items-center gap-1 mt-1">
                        <button 
                          onClick={() => adjustCustomWater(-60)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-black active:scale-90"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-xl font-black text-blue-950 px-2 font-mono">{customWaterMin}</span>
                        <button 
                          onClick={() => adjustCustomWater(60)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-black active:scale-90"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xl font-black text-slate-400">:</div>

                    <div className="flex flex-col items-center">
                      <span className="text-[11px] font-bold text-slate-400">초(Sec)</span>
                      <div className="flex items-center gap-1 mt-1">
                        <button 
                          onClick={() => adjustCustomWater(-10)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-black active:scale-90"
                        >
                          -10초
                        </button>
                        <span className="text-xl font-black text-blue-950 px-2 font-mono">
                          {String(customWaterSec).padStart(2, '0')}
                        </span>
                        <button 
                          onClick={() => adjustCustomWater(10)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-black active:scale-90"
                        >
                          +10초
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 직접 숫자 입력창 보조 */}
                  <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
                    <span className="text-xs font-bold text-slate-500">직접 입력:</span>
                    <input 
                      type="number" 
                      min="0"
                      max="180"
                      value={customWaterMin} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setCustomWaterMin(Math.max(0, Math.min(180, val)));
                      }}
                      className="w-14 p-1.5 text-center font-bold font-mono bg-white border border-slate-300 rounded-lg text-sm"
                    />
                    <span className="text-xs font-bold text-slate-500">분</span>
                    <input 
                      type="number" 
                      min="0"
                      max="59"
                      value={customWaterSec} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setCustomWaterSec(Math.max(0, Math.min(59, val)));
                      }}
                      className="w-14 p-1.5 text-center font-bold font-mono bg-white border border-slate-300 rounded-lg text-sm"
                    />
                    <span className="text-xs font-bold text-slate-500">초 후 알람</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 알람 반복 횟수 설정란 (요청 2: 표준간격과 권장시간 반복횟수도 설정 가능) */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl mb-4 text-center">
            <div className="flex flex-col items-center justify-center gap-1 mb-2">
              <span className="text-xs sm:text-sm font-black text-slate-600 flex items-center gap-1 justify-center">
                <RotateCw className="w-4 h-4 text-slate-500" />
                몇 번 알람을 반복할까요?
              </span>
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full inline-block">
                {waterRepeatTarget === 0 ? "무제한 반복" : `${waterRepeatTarget}회 지정`}
              </span>
            </div>

            {/* 반복 횟수 원터치 선택 */}
            <div className="grid grid-cols-5 gap-1.5 mb-2.5">
              {[0, 1, 2, 3, 5].map((num) => (
                <button
                  key={`water-rep-${num}`}
                  onClick={() => setWaterRepeatTarget(num)}
                  className={`py-2 px-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    waterRepeatTarget === num 
                      ? "bg-blue-800 text-white shadow-sm" 
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {num === 0 ? "무제한" : `${num}회`}
                </button>
              ))}
            </div>

            {/* 횟수 개별 조절기 */}
            <div className="flex justify-center items-center gap-3">
              <button 
                onClick={() => setWaterRepeatTarget((prev) => Math.max(0, prev - 1))}
                className="bg-white hover:bg-slate-100 text-slate-800 p-2 rounded-lg border border-slate-200 font-bold text-xs"
              >
                - 1회 빼기
              </button>
              <span className="text-sm font-black text-slate-800 font-mono">
                {waterRepeatTarget === 0 ? "무제한" : `총 ${waterRepeatTarget}회`}
              </span>
              <button 
                onClick={() => setWaterRepeatTarget((prev) => Math.min(20, prev + 1))}
                className="bg-white hover:bg-slate-100 text-slate-800 p-2 rounded-lg border border-slate-200 font-bold text-xs"
              >
                + 1회 더하기
              </button>
            </div>

            {/* 현재까지 울린 누적 상태 알림판 */}
            <div className="mt-3 bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-600 font-semibold text-center">
              <span>현재 라운딩 누적 알림:</span>
              <span className="font-bold text-blue-700">{waterAlertCount}번 울림 완료</span>
            </div>
          </div>
          
          {/* 작동 조절 구역 */}
          <div className="flex gap-2">
            <button 
              id="water-btn" 
              onClick={toggleWater} 
              className={`flex-1 font-black py-4 sm:py-6 rounded-2xl text-base sm:text-xl shadow-md transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 sm:gap-3 ${
                waterOn 
                  ? "bg-slate-500 hover:bg-slate-600 text-white" 
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {waterOn ? (
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  알림 일시정지
                </span>
              ) : (
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white shrink-0" />
                  물 마시기 시작
                </span>
              )}
            </button>

            <button
              onClick={resetWater}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black px-4 sm:px-5 rounded-2xl text-sm sm:text-base shadow-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center shrink-0"
              title="알림 주기 및 횟수 기록 초기화"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
          
          {waterOn && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              id="water-time" 
              className="text-3xl sm:text-4xl font-black text-blue-800 mt-4 bg-blue-50 p-4 sm:p-5 rounded-2xl border-2 border-blue-200 text-center font-mono flex items-center justify-center gap-2"
            >
              <span className="animate-ping bg-blue-500 h-2.5 w-2.5 rounded-full inline-block shrink-0"></span>
              {mWater > 0 ? `${mWater}분 ` : ""}{sWater}초 후 알람!
            </motion.div>
          )}
        </div>

        {/* 꿀맛 휴식 타이머 카드 */}
        <div className="mb-6 bg-white p-5 sm:p-8 rounded-3xl border-4 border-amber-200 shadow-md text-left">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-amber-100 p-3 rounded-2xl text-amber-700">
              <Timer className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg sm:text-3xl font-black text-amber-950 leading-tight break-keep whitespace-nowrap">
                꿀맛 휴식 타이머
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-bold mt-1">1시간 운동 후에는 그늘에서 10분씩 쉬어야 안전합니다.</p>
            </div>
          </div>

          {/* 골프 운동 시간 주기 방식 선택 */}
          <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 mb-4 text-center">
            <span className="text-xs sm:text-sm font-black text-slate-500 block mb-2">운동 시간 주기 선택</span>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => changeGolfMode("standard")}
                className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex justify-center items-center gap-1.5 ${
                  golfMode === "standard" 
                    ? "bg-emerald-600 text-white shadow-md scale-[1.01]" 
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                권장 시간 (1시간)
              </button>
              <button 
                onClick={() => changeGolfMode("custom")}
                className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex justify-center items-center gap-1.5 ${
                  golfMode === "custom" 
                    ? "bg-emerald-600 text-white shadow-md scale-[1.01]" 
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                내가 정한 시간
              </button>
            </div>

            {/* 골프 내가 정한 시간 조절기 */}
            <AnimatePresence>
              {golfMode === "custom" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mt-3 pt-3 border-t border-amber-100"
                >
                  <p className="text-xs text-emerald-900 font-black text-center mb-2">
                    👇 아래 버튼을 눌러 라운딩 운동 알림 시간을 마음대로 조절하세요!
                  </p>
                  
                  {/* 시간 표시 및 조절 버튼 */}
                  <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-200 max-w-sm mx-auto mb-3">
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] font-bold text-slate-400">분(Min)</span>
                      <div className="flex items-center gap-1 mt-1">
                        <button 
                          onClick={() => adjustCustomGolf(-60)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-black active:scale-90"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-xl font-black text-emerald-950 px-2 font-mono">{customGolfMin}</span>
                        <button 
                          onClick={() => adjustCustomGolf(60)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-black active:scale-90"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xl font-black text-slate-400">:</div>

                    <div className="flex flex-col items-center">
                      <span className="text-[11px] font-bold text-slate-400">초(Sec)</span>
                      <div className="flex items-center gap-1 mt-1">
                        <button 
                          onClick={() => adjustCustomGolf(-10)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-black active:scale-90"
                        >
                          -10초
                        </button>
                        <span className="text-xl font-black text-emerald-950 px-2 font-mono">
                          {String(customGolfSec).padStart(2, '0')}
                        </span>
                        <button 
                          onClick={() => adjustCustomGolf(10)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-black active:scale-90"
                        >
                          +10초
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 직접 숫자 입력창 보조 */}
                  <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
                    <span className="text-xs font-bold text-slate-500">직접 입력:</span>
                    <input 
                      type="number" 
                      min="0"
                      max="300"
                      value={customGolfMin} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setCustomGolfMin(Math.max(0, Math.min(300, val)));
                      }}
                      className="w-14 p-1.5 text-center font-bold font-mono bg-white border border-slate-300 rounded-lg text-sm"
                    />
                    <span className="text-xs font-bold text-slate-500">분</span>
                    <input 
                      type="number" 
                      min="0"
                      max="59"
                      value={customGolfSec} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setCustomGolfSec(Math.max(0, Math.min(59, val)));
                      }}
                      className="w-14 p-1.5 text-center font-bold font-mono bg-white border border-slate-300 rounded-lg text-sm"
                    />
                    <span className="text-xs font-bold text-slate-500">초 동안 측정</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 골프 알람 반복 횟수 설정란 (요청 2: 표준간격과 권장시간 반복횟수도 설정 가능) */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl mb-4 text-center">
            <div className="flex flex-col items-center justify-center gap-1 mb-2">
              <span className="text-xs sm:text-sm font-black text-slate-600 flex items-center gap-1 justify-center">
                <RotateCw className="w-4 h-4 text-slate-500" />
                몇 번 운동 주기를 잴까요? (쉬어가는 총 세트 수)
              </span>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full inline-block">
                {golfRepeatTarget === 0 ? "무제한 반복" : `${golfRepeatTarget}회 지정`}
              </span>
            </div>

            {/* 반복 횟수 원터치 선택 */}
            <div className="grid grid-cols-5 gap-1.5 mb-2.5">
              {[0, 1, 2, 3, 5].map((num) => (
                <button
                  key={`golf-rep-${num}`}
                  onClick={() => setGolfRepeatTarget(num)}
                  className={`py-2 px-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    golfRepeatTarget === num 
                      ? "bg-emerald-800 text-white shadow-sm" 
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {num === 0 ? "무제한" : `${num}세트`}
                </button>
              ))}
            </div>

            {/* 횟수 개별 조절기 */}
            <div className="flex justify-center items-center gap-3">
              <button 
                onClick={() => setGolfRepeatTarget((prev) => Math.max(0, prev - 1))}
                className="bg-white hover:bg-slate-100 text-slate-800 p-2 rounded-lg border border-slate-200 font-bold text-xs"
              >
                - 1회 빼기
              </button>
              <span className="text-sm font-black text-slate-800 font-mono">
                {golfRepeatTarget === 0 ? "무제한" : `총 ${golfRepeatTarget}회`}
              </span>
              <button 
                onClick={() => setGolfRepeatTarget((prev) => Math.min(20, prev + 1))}
                className="bg-white hover:bg-slate-100 text-slate-800 p-2 rounded-lg border border-slate-200 font-bold text-xs"
              >
                + 1회 더하기
              </button>
            </div>

            {/* 현재까지 완료한 누적 상태 알림판 */}
            <div className="mt-3 bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-600 font-semibold text-center">
              <span>현재 라운딩 누적 완주:</span>
              <span className="font-bold text-emerald-800">{golfAlertCount}회차 휴식 완료</span>
            </div>
          </div>
          
          {/* 운동 측정 실행 단추 */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <button 
              id="golf-btn" 
              onClick={toggleGolf} 
              className={`font-black py-4 sm:py-5 px-3 rounded-2xl text-base sm:text-xl shadow-md transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 grow ${
                golfOn 
                  ? "bg-amber-500 text-slate-900 hover:bg-amber-600" 
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {golfOn ? (
                <span className="flex items-center gap-1 sm:gap-2 whitespace-nowrap">
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  운동 일시 정지
                </span>
              ) : (
                <span className="flex items-center gap-1 sm:gap-2 whitespace-nowrap">
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white shrink-0" />
                  파크골프 시작!
                </span>
              )}
            </button>

            <button 
              onClick={resetGolf} 
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-4 sm:py-5 px-3 rounded-2xl text-base sm:text-xl shadow-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 grow"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span className="whitespace-nowrap">기록 초기화</span>
            </button>
          </div>
          
          <div 
            id="golf-time" 
            className="text-3xl sm:text-4xl font-black text-emerald-800 mt-4 bg-slate-50 p-4 sm:p-5 rounded-2xl border-2 border-slate-200 text-center font-mono flex items-center justify-center gap-2"
          >
            {golfOn && <span className="animate-pulse bg-emerald-500 h-2.5 w-2.5 rounded-full inline-block shrink-0"></span>}
            {hGolf > 0 ? `${hGolf}시간 ` : ""}{mGolf}분 {sGolf}초 경과
          </div>
        </div>

        {/* 119 긴급 전화 연동 코너 (안드로이드 다이얼 전송 보장) */}
        <div className="mb-6 bg-red-50 p-5 sm:p-8 rounded-3xl border-4 border-red-300 shadow-md text-left">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-red-200 p-3 rounded-2xl text-red-600">
              <PhoneCall className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl sm:text-3xl font-black text-red-950">🚨 119 긴급 상황 대처</h2>
              <p className="text-xs sm:text-sm text-slate-700 font-bold">몸에 무리가 가거나 어지러우면 주저 없이 전화를 거세요!</p>
            </div>
          </div>
          
          <a 
            id="emergency-call-btn"
            href="tel:119" 
            className="block w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 sm:py-6 rounded-3xl text-xl sm:text-3xl shadow-xl border-4 border-red-800 text-center active:scale-95 transition-transform"
          >
            📞 119 즉시 전화걸기
          </a>

          <div className="mt-4 bg-white/70 p-4 rounded-2xl border border-red-200 text-xs sm:text-sm text-red-950 leading-relaxed font-bold flex items-start gap-2">
            <Info className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <span className="text-red-800 block mb-1">안드로이드 스마트폰 연동 원리:</span>
              이 버튼은 스마트폰의 <span className="underline decoration-red-400">전화 걸기 앱</span>과 다이렉트로 호환되어 다이얼 화면에 <span className="text-red-700 font-black">119</span> 번호를 바로 채워 줍니다. 1초가 시급한 비상 상황에 당황하지 않고 통화를 누를 수 있습니다.
            </div>
          </div>
        </div>
      </div>

      {/* 3. 어르신용 모달 오버레이 안내창 */}
      <AnimatePresence>
        {alertModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl p-6 sm:p-10 max-w-lg w-full shadow-2xl border-4 border-orange-400 text-center relative overflow-hidden"
            >
              {/* 상단 장식바 */}
              <div className="absolute top-0 inset-x-0 h-4 bg-orange-400 animate-pulse"></div>

              <div className="flex justify-center mb-5 mt-3">
                <div className="bg-orange-100 p-5 rounded-full text-orange-600 animate-bounce">
                  <BellRing className="w-12 h-12" />
                </div>
              </div>

              <h3 className="text-xl sm:text-4xl font-black text-slate-950 mb-3 sm:mb-4 tracking-tight leading-tight">
                {alertModal.title}
              </h3>

              <div className="text-sm sm:text-lg text-slate-800 font-bold mb-6 sm:mb-8 leading-relaxed bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 text-left whitespace-pre-line">
                {alertModal.message}
              </div>

              {/* 소리 및 진동 다시 실행 보조 단추 */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
                <button
                  onClick={playAlarmSound}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-950 font-black py-3 sm:py-4 px-1 sm:px-2 rounded-2xl text-xs sm:text-base flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer active:scale-95 border-2 border-amber-200 whitespace-nowrap"
                >
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-800 shrink-0" />
                  소리 다시 재생
                </button>
                <button
                  onClick={triggerVibration}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-black py-3 sm:py-4 px-1 sm:px-2 rounded-2xl text-xs sm:text-base flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer active:scale-95 border-2 border-slate-200 whitespace-nowrap"
                >
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 shrink-0" />
                  진동 한 번 더!
                </button>
              </div>

              <button
                onClick={() => setAlertModal(null)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 sm:py-5 rounded-2xl text-lg sm:text-2xl shadow-lg border-b-4 sm:border-b-8 border-emerald-800 cursor-pointer active:translate-y-1 active:border-b-2 transition-all whitespace-nowrap"
              >
                ✅ 확인했습니다 (끄기)
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
