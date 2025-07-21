export function showIaArrivedBanner() {
    let banner = document.getElementById("ia-arrived-banner") as HTMLDivElement | null;
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "ia-arrived-banner";
        Object.assign(banner.style, {
            position: "absolute",
            top: "60px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#222",
            color: "#fff",
            padding: "14px 32px",
            borderRadius: "18px",
            fontSize: "1.3em",
            zIndex: "200",
            boxShadow: "0 2px 16px #0008",
            opacity: "0.97",
            transition: "opacity 0.5s",
        } as Partial<CSSStyleDeclaration>);
        banner.textContent = "La entidad se ha movido a este mundo, di ¡Hola!";
        document.body.appendChild(banner);
    } else {
        banner.textContent = "La entidad se ha movido a este mundo, di ¡Hola!";
        banner.style.display = "block";
        banner.style.opacity = "0.97";
    }
    setTimeout(() => {
        if (banner) {
            banner.style.opacity = "0";
            setTimeout(() => {
                if (banner) banner.style.display = "none";
            }, 600);
        }
    }, 2500);
}
