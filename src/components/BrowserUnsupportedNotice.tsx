import { BROWSER_UNSUPPORTED_INLINE_SCRIPT } from "@/lib/browser-unsupported";

const CHROME_URL = "https://www.google.com/chrome/";
const FIREFOX_URL = "https://www.mozilla.org/firefox/";
const APPLE_UPDATE_URL =
  "https://support.apple.com/ru-ru/HT201541";

/**
 * Подсказка для устаревших браузеров. По умолчанию скрыта;
 * inline-скрипт показывает её только при несовместимости.
 */
export function BrowserUnsupportedNotice() {
  return (
    <>
      <div
        id="browser-unsupported"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="browser-unsupported-title"
        style={{
          display: "none",
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 16px",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            padding: "24px",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
          }}
        >
          <h1
            id="browser-unsupported-title"
            style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            Браузер не поддерживается
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "0.9375rem",
              lineHeight: 1.5,
              color: "#475569",
            }}
          >
            WakeTeamCRM работает в Safari 16.4 и новее, а также в актуальных
            версиях Chrome и Firefox. Ваш браузер слишком старый для загрузки
            приложения.
          </p>
          <p
            style={{
              margin: "16px 0 0",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#0f172a",
            }}
          >
            Что можно сделать
          </p>
          <ul
            style={{
              margin: "8px 0 0",
              paddingLeft: "1.25rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#334155",
            }}
          >
            <li>
              Обновите macOS:{" "}
              <a href={APPLE_UPDATE_URL} style={{ color: "#15803d" }}>
                инструкция Apple
              </a>
            </li>
            <li>
              Установите{" "}
              <a href={CHROME_URL} style={{ color: "#15803d" }}>
                Google Chrome
              </a>{" "}
              или{" "}
              <a href={FIREFOX_URL} style={{ color: "#15803d" }}>
                Firefox
              </a>{" "}
              и откройте сайт там
            </li>
          </ul>
          <p
            style={{
              margin: "16px 0 0",
              fontSize: "0.8125rem",
              color: "#64748b",
            }}
          >
            Адрес этой страницы:{" "}
            <span style={{ wordBreak: "break-all" }} id="browser-unsupported-url" />
          </p>
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{var u=document.getElementById("browser-unsupported-url");if(u)u.textContent=window.location.href;}catch(e){}${BROWSER_UNSUPPORTED_INLINE_SCRIPT}`,
        }}
      />
    </>
  );
}
