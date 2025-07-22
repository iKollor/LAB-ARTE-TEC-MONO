// welcomePopup.ts
// Muestra un popup de bienvenida y fuerza la interacción del usuario para habilitar el audio

export function showWelcomePopup(onAccept: () => void) {
    const popup = document.createElement('div');
    popup.style.position = 'fixed';
    popup.style.top = '0';
    popup.style.left = '0';
    popup.style.width = '100vw';
    popup.style.height = '100vh';
    popup.style.background = 'rgba(0,0,0,0.85)';
    popup.style.display = 'flex';
    popup.style.flexDirection = 'column';
    popup.style.justifyContent = 'center';
    popup.style.alignItems = 'center';
    popup.style.zIndex = '9999';

    const box = document.createElement('div');
    box.style.background = '#222';
    box.style.padding = '2em 3em';
    box.style.borderRadius = '16px';
    box.style.textAlign = 'center';
    box.style.color = '#fff';
    box.style.boxShadow = '0 4px 32px #0008';

    const title = document.createElement('h2');
    title.textContent = '¡Bienvenido a LAB-ARTE-TEC!';
    box.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = 'Haz clic en "Comenzar" para activar el sonido y disfrutar la experiencia.';
    box.appendChild(desc);

    const btn = document.createElement('button');
    btn.textContent = 'Comenzar';
    btn.style.fontSize = '1.2em';
    btn.style.padding = '0.7em 2em';
    btn.style.borderRadius = '8px';
    btn.style.border = 'none';
    btn.style.background = '#4caf50';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
    btn.style.marginTop = '1.5em';
    btn.onclick = () => {
        popup.remove();
        onAccept();
    };
    box.appendChild(btn);

    popup.appendChild(box);
    document.body.appendChild(popup);
}
