import * as THREE from 'three';
import { MaskConfig } from '../types';

export const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
};

// Procedural Face Math (Ported and scaled for Three.js units ~1 unit = 10cm)
export const getFacePoint = (u: number, v: number, headWidthFactor: number): THREE.Vector3 => {
  // u: -1..1 (Left/Right), v: -1..1 (Chin/Forehead)
  
  // Scale down from the p5 example to reasonable Three.js units
  // p5 example used ~145 width. We'll use ~1.45
  const w = headWidthFactor * 0.55; 
  const h = 1.10; 
  const d = 1.00;

  // Base Ellipsoid mapping
  const theta = mapRange(u, -1, 1, -Math.PI / 1.6, Math.PI / 1.6);
  const phi = mapRange(v, -1, 1, Math.PI / 2.5, -Math.PI / 3); 

  let x = w * Math.sin(theta) * Math.cos(phi * 0.5); 
  let y = -h * Math.sin(phi);
  let z = d * Math.cos(theta) * Math.cos(phi);

  // --- FEATURE SCULPTING (The "Math Mask" Logic) ---
  
  // 1. Nose Bridge
  const noseDist = Math.sqrt(Math.pow(u, 2) + Math.pow(v - (-0.15), 2));
  if (noseDist < 0.3) {
      z += 0.28 * Math.pow(Math.max(0, 1 - noseDist / 0.3), 2);
  }

  // 2. Brow Ridge
  const browY = 0.25;
  const browDist = Math.abs(v - browY);
  if (browDist < 0.2 && Math.abs(u) < 0.7) {
      z += 0.08 * Math.cos(browDist * Math.PI / 0.4);
  }

  // 3. Cheekbones
  if (v < 0 && v > -0.5) {
      const cheekDist = Math.abs(Math.abs(u) - 0.55);
      if (cheekDist < 0.3) {
           x += (u > 0 ? 1 : -1) * 0.08 * Math.cos(cheekDist * Math.PI / 0.6);
           z += 0.05 * Math.cos(cheekDist * Math.PI / 0.6);
      }
  }

  // 4. Chin definition
  if (v < -0.7) {
      z += 0.05;
      x *= 0.8;
  }

  return new THREE.Vector3(x, y, z);
};

export const checkZone = (u: number, v: number, zone: string): boolean => {
  if (zone === 'full') return true;
  
  if (zone === 'domino') {
      if (v > 0.1 && v < 0.6 && Math.abs(u) < 0.85) {
          // Eye holes
          const dLeft = Math.sqrt(Math.pow(u - (-0.4), 2) + Math.pow(v - 0.35, 2));
          const dRight = Math.sqrt(Math.pow(u - 0.4, 2) + Math.pow(v - 0.35, 2));
          if (dLeft < 0.15 || dRight < 0.15) return false;
          return true;
      }
      return false;
  }
  
  if (zone === 'respirator') {
      return (v < -0.1 && v > -0.8 && Math.abs(u) < 0.6);
  }
  
  if (zone === 'jaw') {
      return (v < -0.4 || (Math.abs(u) > 0.7 && v < 0));
  }

  return true;
};

// Brute force snap to mesh (Nearest Neighbor)
export const snapToMesh = (
  target: THREE.Vector3, 
  geometry: THREE.BufferGeometry, 
  matrixWorld: THREE.Matrix4
): { pos: THREE.Vector3, norm: THREE.Vector3 } => {
  
  const posAttribute = geometry.attributes.position;
  const normalAttribute = geometry.attributes.normal;
  
  let minDistanceSq = Infinity;
  let bestIndex = -1;

  // Optimized stride for performance
  const step = Math.floor(Math.max(1, posAttribute.count / 2000)); 

  const tempPos = new THREE.Vector3();
  const worldPos = new THREE.Vector3();

  for (let i = 0; i < posAttribute.count; i += step) {
    tempPos.fromBufferAttribute(posAttribute, i);
    // Transform local vertex to world space to match target
    worldPos.copy(tempPos).applyMatrix4(matrixWorld);
    
    const dSq = target.distanceToSquared(worldPos);
    if (dSq < minDistanceSq) {
      minDistanceSq = dSq;
      bestIndex = i;
    }
  }

  if (bestIndex !== -1) {
    const finalPos = new THREE.Vector3().fromBufferAttribute(posAttribute, bestIndex);
    finalPos.applyMatrix4(matrixWorld); // return in world space
    
    const finalNorm = new THREE.Vector3();
    if (normalAttribute) {
      finalNorm.fromBufferAttribute(normalAttribute, bestIndex);
      // Transform normal to world space (rotation only)
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);
      finalNorm.applyMatrix3(normalMatrix).normalize();
    } else {
      finalNorm.copy(finalPos).normalize();
    }
    
    return { pos: finalPos, norm: finalNorm };
  }

  return { pos: target, norm: target.clone().normalize() };
};

/**
 * Computes accurate normals for a point cloud using K-Nearest Neighbors.
 * This is crucial for realistic lighting on scanned point clouds without connectivity.
 */
export const computePointCloudNormals = (positions: number[]): Float32Array => {
    const count = positions.length / 3;
    const normals = new Float32Array(positions.length);
    const k = 6; // Neighbors to check
    
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const p3 = new THREE.Vector3();
    
    for (let i = 0; i < count; i++) {
        p1.set(positions[i*3], positions[i*3+1], positions[i*3+2]);
        
        // Find nearest neighbors
        let neighbors = [];
        for (let j = 0; j < count; j++) {
            if (i === j) continue;
            p2.set(positions[j*3], positions[j*3+1], positions[j*3+2]);
            const d = p1.distanceToSquared(p2);
            if (neighbors.length < k) {
                neighbors.push({ idx: j, dist: d });
                neighbors.sort((a, b) => a.dist - b.dist);
            } else if (d < neighbors[neighbors.length - 1].dist) {
                neighbors.pop();
                neighbors.push({ idx: j, dist: d });
                neighbors.sort((a, b) => a.dist - b.dist);
            }
        }
        
        // Compute covariance-based normal or simple local plane
        // Simplified: Take cross product of vectors to first two neighbors
        if (neighbors.length >= 2) {
            const n1 = neighbors[0];
            const n2 = neighbors[1];
            
            p2.set(positions[n1.idx*3], positions[n1.idx*3+1], positions[n1.idx*3+2]);
            p3.set(positions[n2.idx*3], positions[n2.idx*3+1], positions[n2.idx*3+2]);
            
            const v1 = new THREE.Vector3().subVectors(p2, p1);
            const v2 = new THREE.Vector3().subVectors(p3, p1);
            
            const n = new THREE.Vector3().crossVectors(v1, v2).normalize();
            
            // Orient normal outwards (assuming roughly centered at origin)
            if (n.dot(p1) < 0) n.negate();
            
            normals[i*3] = n.x;
            normals[i*3+1] = n.y;
            normals[i*3+2] = n.z;
        } else {
            // Fallback to spherical
            const n = p1.clone().normalize();
            normals[i*3] = n.x;
            normals[i*3+1] = n.y;
            normals[i*3+2] = n.z;
        }
    }
    return normals;
};