import React, { useLayoutEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MaskConfig } from '../../types';
import { getFacePoint, mapRange, checkZone, snapToMesh } from '../../utils/math';

interface MaskInstancesProps {
  config: MaskConfig;
  customMesh: THREE.BufferGeometry | null;
  customMeshMatrix: THREE.Matrix4; 
  landmarks?: THREE.Vector3[]; // Real-time 478 points
}

const tempObj = new THREE.Object3D();
const tempColor = new THREE.Color();
const upVec = new THREE.Vector3(0, 1, 0);

const MaskInstances: React.FC<MaskInstancesProps> = ({ config, customMesh, customMeshMatrix, landmarks }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  
  // Store the "Bind Pose" - which instance attaches to which landmark
  const anchorsRef = useRef<{ landmarkIndex: number; offset: THREE.Vector3; basePos: THREE.Vector3 }[] | null>(null);

  // Procedural High-Fidelity Geometry Generation
  const geometry = useMemo(() => {
    let geometries: THREE.BufferGeometry[] = [];
    const disposeList = () => geometries.forEach(g => g.dispose());
    const prepare = (geo: THREE.BufferGeometry) => {
        geo.deleteAttribute('uv'); 
        geo.deleteAttribute('uv2');
        return geo.toNonIndexed();
    };

    try {
        switch (config.shape) {
            case 'box': {
                const main = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                const plateTop = new THREE.BoxGeometry(1, 0.1, 0.6);
                plateTop.translate(0, 0.45, 0);
                const core = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
                core.rotateX(Math.PI/2);
                geometries.push(prepare(main), prepare(plateTop), prepare(core));
                break;
            }
            case 'sphere': {
                const core = new THREE.IcosahedronGeometry(0.4, 1);
                const ring = new THREE.TorusGeometry(0.6, 0.04, 6, 32);
                ring.rotateX(Math.PI / 2); 
                const pin = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6);
                geometries.push(prepare(core), prepare(ring), prepare(pin));
                break;
            }
            case 'torus': {
                const ring = new THREE.TorusGeometry(0.4, 0.1, 6, 6); 
                const node1 = new THREE.BoxGeometry(0.3, 0.3, 0.3);
                node1.translate(0.4, 0, 0);
                const node2 = new THREE.BoxGeometry(0.3, 0.3, 0.3);
                node2.translate(-0.4, 0, 0);
                geometries.push(prepare(ring), prepare(node1), prepare(node2));
                break;
            }
            case 'cylinder': {
                const shaft = new THREE.CylinderGeometry(0.15, 0.15, 1, 8);
                const capTop = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16);
                capTop.translate(0, 0.45, 0);
                const capBot = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16);
                capBot.translate(0, -0.45, 0);
                const ringMid = new THREE.TorusGeometry(0.2, 0.05, 6, 16);
                ringMid.rotateX(Math.PI/2);
                geometries.push(prepare(shaft), prepare(capTop), prepare(capBot), prepare(ringMid));
                break;
            }
            case 'cone':
            default: {
                const spike = new THREE.ConeGeometry(0.15, 1.2, 6); 
                spike.translate(0, 0.6, 0); 
                const base = new THREE.CylinderGeometry(0.3, 0.15, 0.3, 6);
                base.translate(0, 0.15, 0);
                const collar = new THREE.TorusGeometry(0.2, 0.03, 4, 12);
                collar.rotateX(Math.PI/2);
                collar.translate(0, 0.2, 0);
                geometries.push(prepare(spike), prepare(base), prepare(collar));
                break;
            }
        }
        if (geometries.length === 0) return new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const merged = mergeGeometries(geometries, false); 
        if (!merged) throw new Error("Merge failed");
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        disposeList();
        return merged;
    } catch (e) {
        console.error("Geometry merge failed", e);
        disposeList();
        const fallback = new THREE.ConeGeometry(0.2, 1, 8);
        fallback.computeBoundingSphere();
        return fallback;
    }
  }, [config.shape]);

  // Regenerate distribution when config changes
  useLayoutEffect(() => {
    if (!meshRef.current) return;
    
    // Reset anchors when design changes so we re-bind to face next time
    anchorsRef.current = null;

    let idx = 0;
    const count = config.density;
    const seed = 99;
    const random = (offset: number) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
    };

    // Store initial distribution data in userData to be accessed during AR binding
    meshRef.current.userData.instances = [];

    for (let i = 0; i < count; i++) {
      let u = 0, v = 0;
      if (config.distribution === 'grid') {
          const dim = Math.floor(Math.sqrt(count));
          const row = Math.floor(i / dim);
          const col = i % dim;
          u = mapRange(col, 0, dim, -1, 1);
          v = mapRange(row, 0, dim, -1, 1);
      } else if (config.distribution === 'spiral') {
          const angle = i * 2.39996;
          const r = Math.sqrt(i) / Math.sqrt(count);
          u = r * Math.cos(angle); 
          v = r * Math.sin(angle); 
          v *= 1.2; 
      } else {
          u = mapRange(random(i), 0, 1, -1, 1);
          v = mapRange(random(i + 1000), 0, 1, -1, 1);
      }

      if (!checkZone(u, v, config.zone)) continue;
      if (config.zone === 'full' || config.zone === 'domino') {
          const dLeft = Math.sqrt(Math.pow(u - (-0.35), 2) + Math.pow(v - 0.35, 2));
          const dRight = Math.sqrt(Math.pow(u - 0.35, 2) + Math.pow(v - 0.35, 2));
          if (dLeft < 0.12 || dRight < 0.12) continue;
      }

      const pMath = getFacePoint(u, v, config.headWidth);
      let pFinal = pMath.clone();
      let normal = new THREE.Vector3();

      if (customMesh) {
          const snap = snapToMesh(pMath, customMesh, customMeshMatrix);
          pFinal = snap.pos;
          normal = snap.norm;
      } else {
          normal.copy(pFinal).setY(pFinal.y * 0.5).normalize();
          if (pFinal.z > 0.8 && Math.abs(pFinal.x) < 0.2) normal.set(0,0,1);
      }
      pFinal.add(normal.clone().multiplyScalar(config.offset));

      // Orientation
      tempObj.position.copy(pFinal);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(upVec, normal);
      tempObj.setRotationFromQuaternion(quaternion);

      // Scale
      const noiseVal = random(i * 0.1);
      const scale = config.scaleBase + (noiseVal * config.scaleVar);
      tempObj.scale.set(scale, scale, scale);
      tempObj.updateMatrix();
      
      meshRef.current.setMatrixAt(idx, tempObj.matrix);

      // Color
      if (config.colorMode === 'solid') {
          tempColor.set(config.primaryColor);
      } else if (config.colorMode === 'depth') {
          const depth = mapRange(pFinal.z, 0, 1.5, 0.2, 1.0);
          tempColor.setHSL(0.5, 0.8, depth * 0.8);
      } else {
          tempColor.setRGB(normal.x * 0.5 + 0.5, normal.y * 0.5 + 0.5, normal.z * 0.5 + 0.5);
      }
      meshRef.current.setColorAt(idx, tempColor);
      
      // Store Data for Skinning
      meshRef.current.userData.instances.push({
        position: pFinal.clone(),
        normal: normal.clone(),
        scale: scale,
        color: tempColor.clone(),
        matrix: tempObj.matrix.clone() // Default pose
      });

      idx++;

      if (config.symmetry) {
          const symPos = pFinal.clone();
          symPos.x *= -1;
          const symNormal = normal.clone();
          symNormal.x *= -1;
          
          tempObj.position.copy(symPos);
          const symQuat = new THREE.Quaternion();
          symQuat.setFromUnitVectors(upVec, symNormal);
          tempObj.setRotationFromQuaternion(symQuat);
          tempObj.scale.set(scale, scale, scale);
          tempObj.updateMatrix();
          
          meshRef.current.setMatrixAt(idx, tempObj.matrix);
          meshRef.current.setColorAt(idx, tempColor);
          
          meshRef.current.userData.instances.push({
            position: symPos.clone(),
            normal: symNormal.clone(),
            scale: scale,
            color: tempColor.clone(),
            matrix: tempObj.matrix.clone()
          });
          
          idx++;
      }
    }

    meshRef.current.count = idx;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

  }, [config, customMesh, customMeshMatrix, geometry]);

  // AR FACE FILTER LOGIC (Skinning)
  useFrame(() => {
    if (!meshRef.current || !landmarks || landmarks.length === 0) return;

    const instanceData = meshRef.current.userData.instances;
    if (!instanceData) return;

    // 1. Bind Phase: If we haven't bound the mask to the face yet, do it now.
    // We map every mask particle to the nearest landmark on the detected face.
    if (!anchorsRef.current) {
        anchorsRef.current = instanceData.map((inst: any) => {
            let minDist = Infinity;
            let closestIndex = -1;
            
            // Find closest landmark to the procedural "Rest Pose"
            // Note: We assume the mask "Rest Pose" (centered at 0,0,0) roughly aligns
            // with the "Face Center" of the detected face which we force to be centered in AR mode.
            // FaceScanner outputs landmarks centered at 0,0,0 relative to the face group.
            for(let k=0; k<landmarks.length; k++) {
                const dist = inst.position.distanceToSquared(landmarks[k]);
                if (dist < minDist) {
                    minDist = dist;
                    closestIndex = k;
                }
            }
            
            // Calculate offset vector from landmark to instance
            // We'll treat this as a rigid link to that specific skin point
            const anchorPoint = landmarks[closestIndex];
            const offset = new THREE.Vector3().subVectors(inst.position, anchorPoint);
            
            return { landmarkIndex: closestIndex, offset, basePos: inst.position };
        });
        return;
    }

    // 2. Update Phase: Deform the mask based on current landmarks
    let i = 0;
    anchorsRef.current.forEach((anchor, idx) => {
        if (!meshRef.current) return;
        const currentLandmark = landmarks[anchor.landmarkIndex];
        const instOriginal = instanceData[idx];

        // Apply position: Landmark Pos + Original Offset
        // Ideally we would rotate the offset by the surface normal change, but translation is 90% of the effect
        tempObj.position.addVectors(currentLandmark, anchor.offset);
        
        // Use original rotation/scale (could be improved by looking at neighboring landmarks for rotation)
        // Re-construct matrix
        tempObj.scale.set(instOriginal.scale, instOriginal.scale, instOriginal.scale);
        
        // Orient towards normal?
        // Simple approximation: Keep original rotation relative to world, but translated.
        // Better: We need to rotate the particle if the head rotates.
        // The parent group handles the main head rotation. 
        // We only need to handle LOCAL deformation here.
        
        // Since the Parent Group (in App.tsx) is already rotated by the head pose,
        // The landmarks passed in here should be in LOCAL space of the head group?
        // Actually, FaceScanner passes WORLD space landmarks.
        // IF FaceScanner passes WORLD space landmarks, we should NOT be rotating the parent group in App.tsx 
        // OR we should transform landmarks to local space.
        
        // CURRENT ARCHITECTURE FIX:
        // App.tsx rotates the <group>. 
        // FaceScanner.tsx onFaceUpdate returns a matrix that sets that group.
        // FaceScanner ALSO returns "World Landmarks".
        // If we use "World Landmarks" to set position inside a Rotated Group, it will double-rotate.
        
        // FIX: We need local landmarks relative to the head center.
        // FaceScanner calculates: wx = -lx * width. This is relative to head center (0,0,0) in local space.
        // So actually, the "WorldLandmarks" from FaceScanner are LOCAL to the Face Group.
        // So we can just set position directly.
        
        // Restore original rotation
        const p = instOriginal.position;
        const up = new THREE.Vector3(0,1,0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, instOriginal.normal);
        tempObj.setRotationFromQuaternion(q);
        
        tempObj.updateMatrix();
        meshRef.current.setMatrixAt(idx, tempObj.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[geometry, undefined, config.density * 2]} 
      castShadow 
      receiveShadow
    >
      <meshPhysicalMaterial 
        ref={materialRef}
        roughness={config.roughness}
        metalness={config.metalness}
        clearcoat={1.0}
        clearcoatRoughness={0.1}
        sheen={0.5}
        sheenColor="#ffffff"
      />
    </instancedMesh>
  );
};

export default MaskInstances;