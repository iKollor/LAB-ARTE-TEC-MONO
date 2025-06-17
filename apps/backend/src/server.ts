import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

export function startServer(port: number) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    app.get('/', (req, res) => {
        res.send('Servidor en funcionamiento');
    });

    io.on('connection', (socket) => {
        console.log('Un cliente se ha conectado:', socket.id);

        socket.on('disconnect', () => {
            console.log('Cliente desconectado:', socket.id);
        });

        // Aquí puedes manejar otros eventos de Socket.io
    });

    server.listen(port, () => {
        console.log(`Servidor escuchando en http://localhost:${port}`);
    });
}