import React, { useMemo } from 'react';
import * as THREE from 'three';
import { getFacePoint } from '../../utils/math';

interface GhostHeadProps {
  headWidth: number;
  customMesh: THREE.BufferGeometry | null;
  visible: boolean;
}

const GhostHead: React.FC<GhostHeadProps> = ({ headWidth, customMesh, visible }) => {
  
  // Procedural Point Cloud for the default head
  const points = useMemo(() => {
    if (customMesh) return null;
    const pts = [];
    const count = 1000;
    for (let i = 0; i < count; i++) {
        // Random distribution for ghost effect
        const u = (Math.random() * 2) - 1;
        const v = (Math.random() * 2) - 1;
        const vec = getFacePoint(u, v, headWidth);
        pts.push(vec.x, vec.y, vec.z);
    }
    const buffer = new Float32Array(pts);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3));
    return geometry;
  }, [headWidth, customMesh]);

  if (!visible) return null;

  if (customMesh) {
    return (
      <mesh geometry={customMesh}>
        <meshPhysicalMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.15} 
            side={THREE.DoubleSide}
            roughness={0.4}
            metalness={0.1}
            wireframe={false}
        />
      </mesh>
    );
  }

  return (
    <points>
      <primitive object={points} />
      <pointsMaterial size={0.015} color="#8aa0c6" transparent opacity={0.4} sizeAttenuation={true} />
    </points>
  );
};

export default GhostHead;