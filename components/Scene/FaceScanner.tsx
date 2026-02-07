import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FilesetResolver, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { Camera, Scan, AlertCircle, Zap, Cpu, Activity } from 'lucide-react';
import { computePointCloudNormals } from '../../utils/math';

interface FaceScannerProps {
  onCapture: (geometry: THREE.BufferGeometry) => void;
  onCancel: () => void;
  mode: 'scan' | 'ar';
  onFaceUpdate?: (matrix: THREE.Matrix4, detected: boolean, landmarks?: THREE.Vector3[]) => void;
}

const FaceScanner: React.FC<FaceScannerProps> = ({ onCapture, onCancel, mode, onFaceUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [inferenceMode, setInferenceMode] = useState<'GPU' | 'CPU'>('CPU');
  
  const requestRef = useRef<number>();
  const lastResultRef = useRef<FaceLandmarkerResult | null>(null);

  // Smooth Tracking State
  const smoothState = useRef({
      position: new THREE.Vector3(0, 0, 0.5),
      quaternion: new THREE.Quaternion(),
      scale: 1.0
  });

  // Initialize MediaPipe
  useEffect(() => {
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        
        let newLandmarker;
        try {
            newLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU"
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
            setInferenceMode('GPU');
        } catch (gpuError) {
            console.warn("GPU Acceleration unavailable, switching to CPU inference.", gpuError);
            newLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
            setInferenceMode('CPU');
        }

        setLandmarker(newLandmarker);
        setLoading(false);
      } catch (err) {
        console.error("MediaPipe Init Error:", err);
        setError("Neural Engine failure.");
        setLoading(false);
      }
    };
    init();
  }, []);

  // Initialize Camera
  useEffect(() => {
    if (!loading && !error && !videoRef.current?.srcObject) {
        const constraints = { 
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 }, 
                facingMode: "user" 
            } 
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.addEventListener("loadeddata", predictWebcam);
                }
            })
            .catch((err) => {
                console.error("Camera Error:", err);
                setError("Optical sensor access denied.");
            });
    }
    
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loading, error]); 

  // Cleanup
  useEffect(() => {
      return () => {
        if (videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        }
      }
  }, []);

  const predictWebcam = () => {
    if (!landmarker || !videoRef.current) return;
    
    const video = videoRef.current;
    
    if (video.videoWidth > 0) {
        let startTimeMs = performance.now();
        const results = landmarker.detectForVideo(video, startTimeMs);

        // Cache for button actions
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            lastResultRef.current = results;
            setFaceDetected(true);
        } else {
            lastResultRef.current = null;
            setFaceDetected(false);
        }

        // --- SCAN MODE VISUALIZATION ---
        if (mode === 'scan' && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                    const landmarks = results.faceLandmarks[0];
                    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                    for (let i=0; i<landmarks.length; i+=2) {
                        const point = landmarks[i];
                        ctx.beginPath();
                        ctx.arc(point.x * canvas.width, point.y * canvas.height, 0.8, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            }
        }

        // --- AR TRACKING ---
        if (mode === 'ar' && onFaceUpdate) {
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                const landmarks = results.faceLandmarks[0];
                
                // --- METRIC CALCULATION ---
                const pNose = landmarks[1];
                const pLeft = landmarks[33];
                const pRight = landmarks[263];

                const midEyeX = (pLeft.x + pRight.x) / 2;
                const midEyeY = (pLeft.y + pRight.y) / 2;
                
                const dx = pNose.x - midEyeX;
                const dy = pNose.y - midEyeY;

                // Rotation
                const yaw = dx * 3.5; 
                const pitch = dy * 3.0;
                const roll = Math.atan2(pRight.y - pLeft.y, pRight.x - pLeft.x);

                // Depth & Scale
                const aspect = video.videoWidth / video.videoHeight;
                const fovY = 45 * Math.PI / 180;
                const visibleHeightAtZero = 2 * 4.0 * Math.tan(fovY / 2); 
                const visibleWidthAtZero = visibleHeightAtZero * aspect;
                const IPD_UNITS = 0.63;
                const eyeDistNorm = Math.hypot(pLeft.x - pRight.x, pLeft.y - pRight.y);
                let distToCam = (IPD_UNITS * 4.0) / (eyeDistNorm * visibleWidthAtZero);
                distToCam = Math.max(0.5, Math.min(8.0, distToCam));
                
                const targetZ = 4.0 - distToCam;
                const visibleHeightAtDepth = 2 * distToCam * Math.tan(fovY / 2);
                const visibleWidthAtDepth = visibleHeightAtDepth * aspect;

                const targetX = -(pNose.x - 0.5) * visibleWidthAtDepth;
                const targetY = -(pNose.y - 0.5) * visibleHeightAtDepth;

                // Scale
                let targetScale = 1.0;
                if (landmarks.length > 454) {
                    const pCheekL = landmarks[454];
                    const pCheekR = landmarks[234];
                    const cheekDistNorm = Math.hypot(pCheekL.x - pCheekR.x, pCheekL.y - pCheekR.y);
                    const cheekDistWorld = cheekDistNorm * visibleWidthAtDepth;
                    const REF_HEAD_WIDTH = 1.45;
                    targetScale = cheekDistWorld / REF_HEAD_WIDTH;
                }

                // Smoothing
                const smoothFactor = 0.4;
                const tPos = new THREE.Vector3(targetX, targetY, targetZ);
                const tRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, -yaw, -roll));

                smoothState.current.position.lerp(tPos, smoothFactor);
                smoothState.current.quaternion.slerp(tRot, smoothFactor);
                smoothState.current.scale += (targetScale - smoothState.current.scale) * smoothFactor;

                const matrix = new THREE.Matrix4();
                matrix.compose(
                    smoothState.current.position, 
                    smoothState.current.quaternion, 
                    new THREE.Vector3(smoothState.current.scale, smoothState.current.scale, smoothState.current.scale)
                );
                
                const worldLandmarks: THREE.Vector3[] = [];
                for(let i=0; i<landmarks.length; i++) {
                    const l = landmarks[i];
                    const lx = l.x - 0.5;
                    const ly = l.y - 0.5;
                    const depthScale = visibleWidthAtDepth; 
                    const lz = l.z * depthScale; 

                    const wx = -lx * visibleWidthAtDepth;
                    const wy = -ly * visibleHeightAtDepth;
                    const wz = targetZ - lz; 
                    
                    worldLandmarks.push(new THREE.Vector3(wx, wy, wz));
                }

                onFaceUpdate(matrix, true, worldLandmarks);
            } else {
                onFaceUpdate(new THREE.Matrix4(), false, undefined);
            }
        }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const handleCapture = () => {
    const results = lastResultRef.current;
    if (!results) return;
    const vertices: number[] = [];
    if (results.faceWorldLandmarks && results.faceWorldLandmarks.length > 0) {
        const worldLandmarks = results.faceWorldLandmarks[0]; 
        const SCENE_SCALE = 12.0;
        let cx = 0, cy = 0, cz = 0;
        worldLandmarks.forEach(l => { cx += l.x; cy += l.y; cz += l.z; });
        const len = worldLandmarks.length;
        cx /= len; cy /= len; cz /= len;
        worldLandmarks.forEach(l => {
            vertices.push(-(l.x - cx) * SCENE_SCALE, -(l.y - cy) * SCENE_SCALE, (l.z - cz) * SCENE_SCALE); 
        });
    } else if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        const SCALE = 1.5; 
        landmarks.forEach(l => {
            vertices.push(-(l.x - 0.5) * SCALE * 1.5, -(l.y - 0.5) * SCALE, -l.z * SCALE);
        });
    }
    if (vertices.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const normals = computePointCloudNormals(vertices);
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        onCapture(geometry);
    }
  };

  if (mode === 'ar') {
    return (
        <div className="absolute inset-0 -z-50 overflow-hidden">
            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="absolute w-full h-full object-cover transform -scale-x-100 opacity-50 brightness-75 grayscale"
            />
            <div className="absolute top-4 left-4 flex gap-2 z-[60]">
                <div className={`px-3 py-1 bg-black/50 border backdrop-blur text-[10px] tracking-widest font-mono flex items-center gap-2 ${faceDetected ? 'border-holo text-holo' : 'border-red-900 text-red-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${faceDetected ? 'bg-holo' : 'bg-red-500'} animate-pulse`}></div>
                    {faceDetected ? "BIOMETRIC LOCK" : "SEARCHING SUBJECT"}
                </div>
            </div>
            
            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-[60]">
                <button 
                    onClick={onCancel}
                    className="px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-none font-light tracking-[0.2em] backdrop-blur transition-all"
                >
                    TERMINATE SESSION
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[60] bg-void flex flex-col items-center justify-center">
        {loading && <div className="text-holo animate-pulse font-mono text-xs tracking-[0.2em]">INITIALIZING NEURAL NETWORKS...</div>}
        {error && (
            <div className="flex flex-col items-center text-red-400 gap-2 font-mono text-xs">
                <AlertCircle size={16}/>
                <span>ERROR: {error}</span>
                <button onClick={onCancel} className="mt-4 px-4 py-2 border border-red-900 text-red-500 hover:text-red-300">RETURN</button>
            </div>
        )}
        
        <div className={`relative w-full max-w-2xl aspect-video bg-black rounded overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.05)] border border-white/10 ${loading ? 'hidden' : 'block'}`}>
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 grayscale opacity-80" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full transform -scale-x-100" />
            
            {/* 2040 HUD OVERLAY */}
            <div className="absolute inset-0 border-[1px] border-white/5 m-4">
                {/* Corners */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-holo"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-holo"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-holo"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-holo"></div>
                
                {/* Crosshair */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 border border-white/20 rounded-full flex items-center justify-center">
                    <div className="w-0.5 h-0.5 bg-holo rounded-full"></div>
                </div>
            </div>
            
            <div className="absolute top-8 left-8 flex gap-3">
                <div className="px-3 py-1 bg-black/60 backdrop-blur rounded-sm text-[10px] font-mono text-holo border border-holo/30 flex items-center gap-2">
                    {faceDetected ? <Activity size={10} className="animate-pulse text-accent"/> : <AlertCircle size={10}/>}
                    {faceDetected ? "SUBJECT IDENTIFIED" : "SCANNING..."}
                </div>
            </div>

            <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-6">
                <button 
                    onClick={onCancel}
                    className="px-6 py-3 text-[10px] tracking-widest text-textDim hover:text-white transition-colors"
                >
                    CANCEL
                </button>
                <button 
                    type="button"
                    onClick={handleCapture}
                    disabled={!faceDetected}
                    className={`
                        px-10 py-3 flex items-center gap-3 text-xs tracking-widest uppercase transition-all border
                        ${faceDetected 
                            ? 'bg-holo text-black border-holo hover:bg-white hover:scale-105 cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.3)]' 
                            : 'bg-transparent text-gray-600 border-gray-800 cursor-not-allowed'}
                    `}
                >
                    {faceDetected ? <Scan size={14} /> : <Camera size={14} />}
                    {faceDetected ? "ACQUIRE TOPOLOGY" : "ALIGN SENSOR"}
                </button>
            </div>
        </div>
    </div>
  );
};

export default FaceScanner;