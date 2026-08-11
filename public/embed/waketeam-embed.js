/**
 * WakeTeam booking embed — замена Rubitime на waketeam.by
 *
 * <div id="waketeam-booking" data-booking-url="https://booking.waketeam.by/book/waketeam"></div>
 * <script src="https://booking.waketeam.by/embed/waketeam-embed.js" async></script>
 */
(function () {
  var CONTAINER_ID = "waketeam-booking";
  var MIN_HEIGHT = 420;
  var MAX_HEIGHT = 760;

  function viewportHeight() {
    var vv = window.visualViewport;
    if (vv && vv.height) return vv.height;
    return window.innerHeight || document.documentElement.clientHeight || 640;
  }

  /** Leave room for host header / bottom nav; scale with phone height. */
  function targetHeight() {
    var vh = viewportHeight();
    var reserved = Math.round(Math.min(220, Math.max(140, vh * 0.22)));
    return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(vh - reserved)));
  }

  function init() {
    var el = document.getElementById(CONTAINER_ID);
    if (!el) return;

    var base =
      el.getAttribute("data-booking-url") ||
      (document.currentScript &&
        document.currentScript.getAttribute("data-booking-url")) ||
      "";

    if (!base) {
      console.error("[waketeam-booking] Укажите data-booking-url");
      return;
    }

    var iframe = document.createElement("iframe");
    iframe.src = base.indexOf("?") >= 0 ? base + "&embed=1" : base + "?embed=1";
    iframe.style.width = "100%";
    iframe.style.height = targetHeight() + "px";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.maxHeight = "none";
    iframe.title = "Онлайн-запись WakeTeam";
    iframe.id = "waketeam-booking-iframe";
    iframe.setAttribute("scrolling", "no");

    el.innerHTML = "";
    el.appendChild(iframe);

    var lastApplied = 0;

    function applyHeight(raw) {
      var reported = Math.round(Number(raw));
      var cap = targetHeight();
      var next = cap;
      if (isFinite(reported) && reported > 0) {
        // Prefer viewport fit; allow a bit more only if content asks and still under cap.
        next = Math.max(MIN_HEIGHT, Math.min(cap, reported + 16));
      }
      if (Math.abs(next - lastApplied) < 8) return;
      lastApplied = next;
      iframe.style.height = next + "px";
    }

    function syncToViewport() {
      applyHeight(targetHeight());
    }

    window.addEventListener("message", function (e) {
      if (!e.data) return;
      var payload = e.data;
      if (typeof payload === "string") {
        if (payload.indexOf("height") === -1) return;
        try {
          payload = JSON.parse(payload);
        } catch (err) {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "static" && payload.height) {
        applyHeight(payload.height);
      }
    });

    window.addEventListener("resize", syncToViewport);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncToViewport);
    }
    syncToViewport();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
