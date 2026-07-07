/** Минимальная поддерживаемая версия Safari (Next.js 16 baseline). */
export const MIN_SAFARI_MAJOR = 16;
export const MIN_SAFARI_MINOR = 4;

export function isChromiumFamilyUserAgent(userAgent: string): boolean {
  return /Chrome|Chromium|Edg|OPR|Firefox/.test(userAgent);
}

export function parseSafariVersion(userAgent: string): { major: number; minor: number } | null {
  if (isChromiumFamilyUserAgent(userAgent)) return null;
  const match = userAgent.match(/Version\/(\d+)\.(\d+)(?:\.(\d+))?.*Safari/i);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

export function isUnsupportedSafariUserAgent(userAgent: string): boolean {
  const version = parseSafariVersion(userAgent);
  if (!version) return false;
  if (version.major < MIN_SAFARI_MAJOR) return true;
  if (version.major === MIN_SAFARI_MAJOR && version.minor < MIN_SAFARI_MINOR) {
    return true;
  }
  return false;
}

/** Inline-скрипт без зависимостей: показывает подсказку только при несовместимом браузере. */
export const BROWSER_UNSUPPORTED_INLINE_SCRIPT = `(function(){
  function isChromiumFamily(ua){
    return /Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  }
  function isOldSafari(ua){
    if(isChromiumFamily(ua)) return false;
    var m=ua.match(/Version\\/(\\d+)\\.(\\d+)(?:\\.(\\d+))?.*Safari/i);
    if(!m) return false;
    var major=+m[1],minor=+m[2];
    if(major<${MIN_SAFARI_MAJOR}) return true;
    if(major===${MIN_SAFARI_MAJOR}&&minor<${MIN_SAFARI_MINOR}) return true;
    return false;
  }
  function lacksModernFeatures(){
    try{
      if(!window.CSS||!CSS.supports("color","oklch(0 0 0)")) return true;
      return false;
    }catch(e){
      return true;
    }
  }
  if(!isOldSafari(navigator.userAgent)&&!lacksModernFeatures()) return;
  var el=document.getElementById("browser-unsupported");
  if(!el) return;
  el.style.display="flex";
  document.documentElement.style.overflow="hidden";
})();`;
