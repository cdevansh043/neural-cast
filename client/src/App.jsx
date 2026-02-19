import React, { useState, useEffect, useRef, useMemo } from 'react';
import Webcam from 'react-webcam';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import io from 'socket.io-client';
import { Cpu, Activity, Mic, Signal, Zap } from 'lucide-react';

// --- CONFIGURATION ---
const SERVER_URL = "http://localhost:8000";

// --- COMPONENT: HOLOGRAPHIC FACE (The "Receiver") ---
const HolographicFace = ({ streamData, textureUrl }) => {
  const pointsRef = useRef();
  
  // 1. Geometry: 478 Points (Simple & Crash-Proof)
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const count = 478;
    const pos = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return geo;
  }, []);

  // 2. Animation Loop
  useFrame(() => {
    if (!pointsRef.current || !streamData || !streamData.points) return;
    
    const positions = pointsRef.current.geometry.attributes.position;
    const incomingData = streamData.points;

    for (let i = 0; i < 478; i++) {
        const ix = i * 3;
        // Map 0-1 coords to 3D Space
        const x = (0.5 - incomingData[ix]) * 5;      // Flip X
        const y = (0.5 - incomingData[ix+1]) * 4;  
        const z = incomingData[ix+2] * -8;           // Depth
        
        // Snap to position
        positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
       <pointsMaterial 
          color="#00f3ff"   // NEON CYAN
          size={0.15}       // Large readable dots
          sizeAttenuation={true}
          transparent={true}
          opacity={0.8}
          blending={THREE.AdditiveBlending}
       />
    </points>
  );
};

// --- MAIN APPLICATION ---
function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [serverStatus, setServerStatus] = useState("CONNECTING...");
  const [incomingStream, setIncomingStream] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [bandwidth, setBandwidth] = useState(15); // Fake starting value

  const webcamRef = useRef(null);
  const socketRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const recognitionRef = useRef(null);

  // 1. SETUP: Socket & AI
  useEffect(() => {
    // Socket
    socketRef.current = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current.on('connect', () => setServerStatus("CONNECTED"));
    socketRef.current.on('receive_stream', (data) => setIncomingStream(data));

    // MediaPipe AI
    const loadAI = async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU",
        },
        outputFaceBlendshapes: false,
        runningMode: "VIDEO",
        numFaces: 1,
      });
    };
    loadAI();

    // Speech Recognition
    if ('webkitSpeechRecognition' in window) {
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
            const t = e.results[e.results.length - 1][0].transcript;
            setTranscript(t);
        };
        recognitionRef.current = recognition;
    }

    return () => socketRef.current.disconnect();
  }, []);

  // 2. LOOP: Process Webcam Frame
  const processFrame = () => {
    if (!isStreaming) return;

    if (webcamRef.current && webcamRef.current.video && faceLandmarkerRef.current) {
        const video = webcamRef.current.video;
        if (video.currentTime > 0 && !video.paused && !video.ended) {
            const results = faceLandmarkerRef.current.detectForVideo(video, performance.now());
            
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                const landmarks = results.faceLandmarks[0];
                const flatPoints = [];
                // Flatten data
                for(let i=0; i<landmarks.length; i++) {
                    flatPoints.push(landmarks[i].x, landmarks[i].y, landmarks[i].z);
                }
                
                // Send to Server
                if(socketRef.current) {
                    socketRef.current.emit('frame_data', { points: flatPoints });
                }
            }
        }
    }
    requestAnimationFrame(processFrame);
  };

  // 3. CONTROLS
  const toggleStream = () => {
    const newState = !isStreaming;
    setIsStreaming(newState);
    
    if (newState) {
        requestAnimationFrame(processFrame);
        recognitionRef.current?.start();
        // Simulate Bandwidth fluctuation
        setInterval(() => setBandwidth(12 + Math.random() * 5), 500);
    } else {
        recognitionRef.current?.stop();
        setTranscript("");
    }
  };

  return (
    <div className="min-h-screen bg-[#050510] text-white font-sans overflow-hidden">
      {/* HEADER */}
      <header className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center">
                <Cpu className="text-white w-6 h-6" />
            </div>
            <div>
                <h1 className="font-bold text-xl leading-none">NEURAL-CAST <span className="text-cyan-400">PRO</span></h1>
                <p className="text-[10px] text-gray-400 tracking-[0.2em] mt-1">GENERATIVE BANDWIDTH PROTOCOL</p>
            </div>
         </div>
         <div className={`text-xs px-3 py-1 rounded font-bold border ${serverStatus==="CONNECTED"?"border-green-500/50 text-green-400":"border-red-500/50 text-red-400"}`}>{serverStatus}</div>
      </header>

      {/* DASHBOARD */}
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4 h-[80vh]">
         
         {/* LEFT: SENDER (Webcam) */}
         <div className="flex flex-col gap-4 relative">
            <h2 className="text-xs font-bold text-gray-400 flex items-center gap-2"><Activity size={14} className="text-cyan-400"/> LOCAL INPUT (SENDER)</h2>
            
            <div className="flex-1 bg-black rounded-2xl overflow-hidden border border-gray-800 relative shadow-2xl">
                <Webcam
                    ref={webcamRef}
                    className="w-full h-full object-cover"
                    mirror={true}
                />
                {isStreaming && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500/20 px-2 py-1 rounded border border-red-500/50">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                        <span className="text-[10px] text-red-400 font-bold">LIVE CAPTURE</span>
                    </div>
                )}
            </div>

            {/* BANDWIDTH COMPARISON GRAPH */}
            <div className="h-24 bg-gray-900/50 border border-gray-800 rounded-xl p-4 flex flex-col justify-center">
                <div className="flex justify-between text-[10px] text-gray-500 mb-2 font-bold tracking-widest">
                    <span>BANDWIDTH USAGE</span>
                    <span className="text-cyan-400">{isStreaming ? bandwidth.toFixed(1) : 0} KB/s</span>
                </div>
                {/* Bar 1: Standard Video */}
                <div className="mb-2">
                    <div className="text-[8px] text-red-500 mb-0.5">STANDARD VIDEO (1500 KB/s)</div>
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500/50 w-full"></div>
                    </div>
                </div>
                {/* Bar 2: Neural Cast */}
                <div>
                    <div className="text-[8px] text-green-500 mb-0.5">NEURAL-CAST ({bandwidth.toFixed(0)} KB/s)</div>
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div style={{width: '2%'}} className="h-full bg-green-500 w-full animate-pulse"></div>
                    </div>
                </div>
            </div>
         </div>

         {/* RIGHT: RECEIVER (Hologram) */}
         <div className="flex flex-col gap-4 relative">
            <h2 className="text-xs font-bold text-gray-400 flex items-center gap-2"><Cpu size={14} className="text-purple-400"/> NEURAL RECONSTRUCTION</h2>
            
            <div className="flex-1 bg-black rounded-2xl overflow-hidden border border-gray-800 relative shadow-2xl shadow-purple-900/10">
                {isStreaming ? (
                    <>
                        <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
                            <ambientLight intensity={2} />
                            <PerspectiveCamera makeDefault position={[0, 0, 3]} />
                            <OrbitControls enableZoom={false} enablePan={false} />
                            <HolographicFace streamData={incomingStream} />
                            <EffectComposer>
                                <Bloom luminanceThreshold={0} intensity={1.5} radius={0.5} />
                            </EffectComposer>
                        </Canvas>

                        {/* LIVE TRANSCRIPT OVERLAY */}
                        <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                            <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 max-w-[80%] text-center">
                                <p className="text-cyan-400 font-mono text-sm tracking-wide">
                                    {transcript || "Listening..."}
                                </p>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-600/50">
                        <Signal size={48} className="mb-4 opacity-20"/>
                        <p className="text-xs tracking-[0.3em] font-light">AWAITING UPLINK</p>
                    </div>
                )}
            </div>
            
            <button 
                onClick={toggleStream}
                className={`w-full py-6 rounded-xl font-bold tracking-widest text-sm transition-all shadow-lg ${isStreaming ? "bg-red-500/10 border border-red-500 text-red-500 hover:bg-red-500/20" : "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:shadow-[0_0_30px_rgba(6,182,212,0.4)]"}`}
            >
                {isStreaming ? "TERMINATE LINK" : "INITIALIZE PROTOCOL"}
            </button>
         </div>
      </main>
    </div>
  );
}

export default App;