let iaPopupVisible = false;
let iaPopupFinalizado = false;
let iaPopupClickHandler: ((this: Document, ev: MouseEvent) => void) | null = null;
let typingInterval: ReturnType<typeof setInterval> | null = null;

export function mostrarMensajeIA(text: string, isFinal = false) {
    console.log('[FRONT][IA][RECIBIDO]', text);
    let chatEl = document.getElementById("ia-chat") as HTMLDivElement | null;
    if (!chatEl) {
        chatEl = document.createElement("div");
        chatEl.id = "ia-chat";
        Object.assign(chatEl.style, {
            position: "absolute",
            bottom: "30px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            padding: "16px 24px",
            borderRadius: "16px",
            fontSize: "1.2em",
            maxWidth: "80vw",
            zIndex: "100",
        } as Partial<CSSStyleDeclaration>);
        document.body.appendChild(chatEl);
        console.log('[FRONT][IA][DOM] Elemento ia-chat creado');
    }
    chatEl.style.display = "block";
    iaPopupVisible = true;
    iaPopupFinalizado = isFinal;
    // Manejo de typing y texto
    if (!isFinal) {
        let typing = chatEl.querySelector(".typing-indicator") as HTMLSpanElement | null;
        if (!typing) {
            typing = document.createElement("span");
            typing.className = "typing-indicator";
            typing.style.marginLeft = "8px";
            typing.style.opacity = "0.7";
            typing.textContent = "";
            chatEl.appendChild(typing);
        }
        chatEl.textContent = text;
        chatEl.appendChild(typing);
        let dots = 0;
        if (typingInterval) clearInterval(typingInterval);
        typingInterval = setInterval(() => {
            dots = (dots + 1) % 4;
            typing.textContent = " " + ".".repeat(dots);
        }, 400);
    } else {
        if (typingInterval) clearInterval(typingInterval);
        const typing = chatEl.querySelector(".typing-indicator") as HTMLSpanElement | null;
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        chatEl.textContent = text;
    }
    chatEl.style.display = "block";
    // Click para cerrar el popup solo si es final
    if (iaPopupClickHandler) {
        document.removeEventListener("mousedown", iaPopupClickHandler);
    }
    iaPopupClickHandler = function () {
        if (iaPopupFinalizado && chatEl) chatEl.style.display = "none";
        iaPopupVisible = false;
        if (iaPopupClickHandler) {
            document.removeEventListener("mousedown", iaPopupClickHandler);
        }
    };
    if (iaPopupFinalizado) {
        setTimeout(() => {
            if (iaPopupVisible && iaPopupClickHandler) {
                document.addEventListener("mousedown", iaPopupClickHandler);
            }
        }, 50);
    }
}

export function resetIaPopup() {
    iaPopupVisible = false;
    iaPopupFinalizado = false;
    if (iaPopupClickHandler) {
        document.removeEventListener("mousedown", iaPopupClickHandler);
        iaPopupClickHandler = null;
    }
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
}

export function isIaPopupVisible() {
    return iaPopupVisible;
}
