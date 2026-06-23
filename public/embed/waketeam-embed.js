/**
 * WakeTeam booking embed — замена Rubitime на waketeam.by
 *
 * <div id="waketeam-booking" data-booking-url="https://booking.waketeam.by/book/waketeam"></div>
 * <script src="https://booking.waketeam.by/embed/waketeam-embed.js" async></script>
 */
(function () {
  var CONTAINER_ID = "waketeam-booking";
  var DEFAULT_HEIGHT = 520;

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
    iframe.style.height = DEFAULT_HEIGHT + "px";
    iframe.style.border = "0";
    iframe.title = "Онлайн-запись WakeTeam";
    iframe.id = "waketeam-booking-iframe";

    el.innerHTML = "";
    el.appendChild(iframe);

    window.addEventListener("message", function (e) {
      if (!e.data || typeof e.data !== "string") return;
      if (e.data.indexOf("height") === -1) return;
      try {
        var t = JSON.parse(e.data);
        if (t.type === "static" && t.height) {
          iframe.style.height = Math.round(t.height) + 20 + "px";
        }
      } catch (err) {
        /* ignore */
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
