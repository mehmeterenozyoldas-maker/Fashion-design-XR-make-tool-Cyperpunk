import React, { useState, Suspense, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Loader } from '@react-three/drei';
import { XR, ARButton, Controllers, Hands, useHitTest, useXR } from '@react-three/xr';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { ScanFace } from 'lucide-react';

// Components
import Sidebar from './components/UI/Sidebar';
import GhostHead from './components/Scene/GhostHead';
import MaskInstances from './components/Scene/MaskInstances';
import FaceScanner from './components/Scene/FaceScanner';

// Utils
import { DEFAULT_CONFIG, MaskConfig, AnimationDef } from './types';

// AR Scene Manager Component
interface XRSceneProps {
    faceARMode: boolean;
    faceGroupRef: React.RefObject<THREE.Group>;
    children: React.ReactNode;
}

const XRScene: React.FC<XRSceneProps> = ({ faceARMode, faceGroupRef, children }) => {
    const { isPresenting } = useXR();
    const reticleRef = useRef<THREE.Mesh>(null);
    const [isPlaced, setIsPlaced] = useState(false);
    const { session } = useXR();
    
    // Store latest hit matrix for placement
    const hitMatrixRef = useRef<THREE.Matrix4>(new THREE.Matrix4());

    useHitTest((hitMatrix) => {
        if (faceARMode || !isPresenting || isPlaced) return;
        
        // Cache the raw matrix
        hitMatrixRef.current.copy(hitMatrix);

        if (reticleRef.current) {
            reticleRef.current.visible = true;
            // Apply position/rotation from hit test to reticle
            hitMatrix.decompose(
                reticleRef.current.position, 
                reticleRef.current.quaternion, 
                reticleRef.current.scale
            );
            // Visual tweak: Rotate ring to lie flat on surface (Geometry faces Z, we want it facing Y)
            reticleRef.current.rotation.x = -Math.PI / 2;
        }
    });

    useEffect(() => {
        if (!session || !isPresenting || faceARMode) return;

        const onSelect = () => {
            if (isPlaced) {
                // Tap to pick up / reset
                setIsPlaced(false);
            } else if (reticleRef.current && reticleRef.current.visible) {
                setIsPlaced(true);
                
                if (faceGroupRef.current) {
                    const pos = new THREE.Vector3();
                    const quat = new THREE.Quaternion();
                    const scale = new THREE.Vector3();
                    
                    // Use the stored raw matrix (before visual rotation tweaks)
                    hitMatrixRef.current.decompose(pos, quat, scale);

                    faceGroupRef.current.position.copy(pos);
                    // Align the mask upright with the surface normal
                    faceGroupRef.current.quaternion.copy(quat);
                }
            }
        };

        session.addEventListener('select', onSelect);
        return () => session.removeEventListener('select', onSelect);
    }, [session, isPlaced, isPresenting, faceARMode]);

    return (
        <>
            {isPresenting && !faceARMode && !isPlaced && (
                <mesh ref={reticleRef} rotation-x={-Math.PI / 2}>
                    <ringGeometry args={[0.15, 0.2, 32]} />
                    <meshBasicMaterial color="white" />
                </mesh>
            )}
            {children}
        </>
    );
};

function App() {
  const [config, setConfig] = useState<MaskConfig>(DEFAULT_CONFIG);
  const [animations, setAnimations] = useState<Record<string, AnimationDef>>({});
  
  // Render config tracks the instantaneous values (including animation state)
  const [renderConfig, setRenderConfig] = useState<MaskConfig>(DEFAULT_CONFIG);
  
  const [ghostVisible, setGhostVisible] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [faceARMode, setFaceARMode] = useState(false);
  
  const [customMesh, setCustomMesh] = useState<THREE.BufferGeometry | null>(null);
  const [customMeshMatrix, setCustomMeshMatrix] = useState<THREE.Matrix4>(new THREE.Matrix4());
  const [faceLandmarks, setFaceLandmarks] = useState<THREE.Vector3[] | undefined>(undefined);

  const faceGroupRef = useRef<THREE.Group>(null);
  const requestRef = useRef<number>();

  const handleUpdateConfig = (key: keyof MaskConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleUpdateAnimation = (key: string, def: Partial<AnimationDef>) => {
      setAnimations(prev => ({
          ...prev,
          [key]: {
              ...(prev[key] || { active: false, min: 0, max: 1, speed: 1 }),
              ...def
          }
      }));
  };

  // Animation Loop
  useEffect(() => {
    const loop = () => {
        const time = performance.now() / 1000;
        let hasActiveAnim = false;
        
        // Clone base config
        const nextConfig = { ...config };

        // Apply animations
        Object.entries(animations).forEach(([key, value]) => {
            const anim = value as AnimationDef;
            if (anim.active && typeof nextConfig[key as keyof MaskConfig] === 'number') {
                hasActiveAnim = true;
                // Calculate Sine Wave: val = min + (normSine * (max-min))
                const sine = Math.sin(time * anim.speed);
                const norm = (sine + 1) / 2; // 0 to 1
                const val = anim.min + norm * (anim.max - anim.min);
                (nextConfig as any)[key] = val;
            }
        });

        setRenderConfig(nextConfig);

        if (hasActiveAnim) {
            requestRef.current = requestAnimationFrame(loop);
        } else {
            // If no animations, ensure renderConfig matches base config
            setRenderConfig(config);
        }
    };

    // Start loop if any animation is active
    if (Object.values(animations).some((a) => (a as AnimationDef).active)) {
        requestRef.current = requestAnimationFrame(loop);
    } else {
        setRenderConfig(config);
    }

    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animations, config]); // Re-bind when base settings change

  const handlePreset = (presetConfig: Partial<MaskConfig>) => {
    setConfig(prev => ({ ...prev, ...presetConfig }));
    setAnimations({}); // Clear animations on preset change
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
        app: "NeuroMask",
        version: "2.1",
        timestamp: new Date().toISOString(),
        config: config,
        animations: animations
    }, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "neuromask_design.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const loader = new OBJLoader();
    
    loader.load(url, (obj) => {
        let mesh: THREE.Mesh | null = null;
        obj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && !mesh) {
                mesh = child as THREE.Mesh;
            }
        });

        if (mesh) {
            const geometry = (mesh as THREE.Mesh).geometry;
            geometry.computeVertexNormals();
            geometry.center();
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox!;
            const width = bbox.max.x - bbox.min.x;
            const scaleFactor = 1.6 / width;
            geometry.scale(scaleFactor, scaleFactor, scaleFactor);
            setCustomMesh(geometry);
            setCustomMeshMatrix(new THREE.Matrix4().identity());
        }
        URL.revokeObjectURL(url);
    });
  };

  const handleFaceCapture = (geometry: THREE.BufferGeometry) => {
      setCustomMesh(geometry);
      setCustomMeshMatrix(new THREE.Matrix4().identity());
      setScanning(false);
      setGhostVisible(false); 
  };

  const handleFaceTrackingUpdate = (matrix: THREE.Matrix4, detected: boolean, landmarks?: THREE.Vector3[]) => {
      if (faceGroupRef.current) {
          if (detected) {
            faceGroupRef.current.visible = true;
            
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            matrix.decompose(pos, quat, scale);
            
            // In Face AR Mode, we update every frame
            faceGroupRef.current.position.lerp(pos, 0.8);
            faceGroupRef.current.quaternion.slerp(quat, 0.8);
            faceGroupRef.current.scale.lerp(scale, 0.8);

            if (landmarks) {
                setFaceLandmarks(landmarks);
            }
          }
      }
  };

  return (
    <div className="w-full h-screen bg-void relative">
      
      {/* AR FACE TRY-ON BUTTON */}
      {!scanning && !faceARMode && (
        <button 
            onClick={() => {
                setFaceARMode(true);
                setGhostVisible(false);
            }}
            className="absolute top-6 right-6 z-50 px-5 py-2.5 bg-white/5 border border-white/20 hover:bg-white/10 hover:border-white text-white font-light text-xs tracking-widest uppercase transition-all flex items-center gap-2 backdrop-blur-md"
        >
            <ScanFace size={16} />
            Initialize AR Link
        </button>
      )}

      {/* Standard Scan Modal */}
      {scanning && (
          <FaceScanner 
            mode="scan"
            onCapture={handleFaceCapture} 
            onCancel={() => setScanning(false)} 
          />
      )}

      {/* Face AR Runner */}
      {faceARMode && (
          <FaceScanner 
            mode="ar"
            onCapture={() => {}} 
            onCancel={() => {
                setFaceARMode(false);
                setGhostVisible(true);
                setFaceLandmarks(undefined); 
            }}
            onFaceUpdate={handleFaceTrackingUpdate}
          />
      )}

      {!scanning && !faceARMode && (
          <Sidebar 
            config={config} 
            updateConfig={handleUpdateConfig}
            animations={animations}
            updateAnimation={handleUpdateAnimation}
            onExport={handleExport}
            onUpload={handleFileUpload}
            onToggleGhost={() => setGhostVisible(!ghostVisible)}
            ghostVisible={ghostVisible}
            applyPreset={handlePreset}
            usingCustomMesh={!!customMesh}
            onStartScan={() => setScanning(true)}
          />
      )}

      {/* WebXR AR Button (Room Scale) */}
      {!faceARMode && (
          <ARButton 
            className="absolute bottom-6 right-6 z-40 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-light text-xs tracking-widest uppercase backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer outline-none"
            sessionInit={{ 
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['dom-overlay', 'local-floor', 'bounded-floor', 'hand-tracking'], 
                domOverlay: { root: document.body } 
            }}
          >
            Deploy Room Scale
          </ARButton>
      )}
      
      <Canvas shadows camera={{ position: [0, 0, 4], fov: 45 }} className="outline-none" gl={{ antialias: false, alpha: true, preserveDrawingBuffer: true }}>
        <XR>
            <Controllers />
            <Hands />
            <Suspense fallback={null}>
                <XRScene faceARMode={faceARMode} faceGroupRef={faceGroupRef}>
                    <group 
                        ref={faceGroupRef} 
                        position={faceARMode ? [0, 0, 0] : [0, -0.2, 0]}
                    >
                        {/* Note: renderConfig is passed here, so instances oscillate */}
                        <MaskInstances 
                            config={renderConfig} 
                            customMesh={customMesh} 
                            customMeshMatrix={customMeshMatrix}
                            landmarks={faceARMode ? faceLandmarks : undefined}
                        />
                        <GhostHead 
                            headWidth={renderConfig.headWidth} 
                            customMesh={customMesh}
                            visible={ghostVisible && !faceARMode} 
                        />
                    </group>
                    
                    {/* Scene Lighting - Cool Lab Aesthetics */}
                    <ambientLight intensity={faceARMode ? 0.8 : 0.1} color="#b0d4ff" />
                    <spotLight 
                        position={[5, 10, 5]} 
                        angle={0.4} 
                        penumbra={0.5} 
                        intensity={10} 
                        castShadow 
                        shadow-bias={-0.0001}
                        color="white"
                    />
                    <spotLight position={[-5, 0, 2]} intensity={5} color="#4c6ef5" />
                    
                    {faceARMode && <pointLight position={[0, 0, 2]} intensity={3} color="white" />}
                    
                    {!faceARMode && (
                        <>
                            {/* Environment: Studio/Lab feel instead of city */}
                            <Environment preset="studio" background={false} blur={1} />
                            
                            <ContactShadows resolution={1024} scale={10} blur={2} opacity={0.5} far={10} color="#000000" />
                            <OrbitControls 
                                minDistance={2} 
                                maxDistance={8} 
                                enablePan={false}
                                dampingFactor={0.05}
                            />
                        </>
                    )}

                    <EffectComposer disableNormalPass>
                        <Bloom luminanceThreshold={0.7} mipmapBlur intensity={1.2} radius={0.5} />
                        <Vignette eskil={false} offset={0.1} darkness={0.8} />
                        <Noise opacity={0.05} />
                    </EffectComposer>
                </XRScene>
            </Suspense>
        </XR>
      </Canvas>
      <Loader />
    </div>
  );
}

export default App;