import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app_socket = socketio.ASGIApp(sio, app)

@sio.event
async def connect(sid, environ):
    print(f"✅ CLIENT CONNECTED: {sid}")

@sio.event
async def frame_data(sid, data):
    # Relay to everyone (Simple Broadcast)
    await sio.emit('receive_stream', data)

@sio.event
async def send_texture(sid, data):
    await sio.emit('receive_texture', data)

if __name__ == "__main__":
    uvicorn.run(app_socket, host="0.0.0.0", port=8000)