let iaPopupVisible = false;
let iaPopupFinalizado = false;
let iaPopupClickHandler: ((this: Document, ev: MouseEvent) => void) | null = null;
let typingInterval: ReturnType<typeof setInterval> | null = null;

export function mostrarMensajeIA(text: string, isFinal = false) {
    console.log('[FRONT][IA][RECIBIDO]', text);
    let chat = document.getElementById("ia-chat") as HTMLDivElement | null;
    if (!chat) {
        chat = document.createElement("div");
        chat.id = "ia-chat";
        Object.assign(chat.style, {
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
        document.body.appendChild(chat);
    }
    if (!isFinal) {
        let typing = chat.querySelector(".typing-indicator") as HTMLSpanElement | null;
        if (!typing) {
            typing = document.createElement("span");
            typing.className = "typing-indicator";
            typing.style.marginLeft = "8px";
            typing.style.opacity = "0.7";
            typing.textContent = "";
            chat.appendChild(typing);
        }
        if (chat.childNodes.length > 1) {
            chat.childNodes[0].textContent = text;
        } else {
            chat.textContent = text;
        }
        if (typing) {
            let dots = 0;
            if (typingInterval) clearInterval(typingInterval);
            typingInterval = setInterval(() => {
                dots = (dots + 1) % 4;
                typing.textContent = " " + ".".repeat(dots);
            }, 400);
        }
    } else {
        if (typingInterval) clearInterval(typingInterval);
        const typing = chat.querySelector(".typing-indicator") as HTMLSpanElement | null;
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        chat.textContent = text;
    }
    chat.style.display = "block";
    iaPopupVisible = true;
    iaPopupFinalizado = isFinal;
    if (iaPopupClickHandler) {
        document.removeEventListener("mousedown", iaPopupClickHandler);
    }
    iaPopupClickHandler = function () {
        if (iaPopupFinalizado && chat) chat.style.display = "none";
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
