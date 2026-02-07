
export type DistributionType = 'grid' | 'spiral' | 'random';
export type ZoneType = 'full' | 'domino' | 'respirator' | 'jaw';
export type ShapeType = 'cone' | 'sphere' | 'box' | 'torus' | 'cylinder';
export type ColorMode = 'normal' | 'depth' | 'solid';

export interface MaskConfig {
  // Anatomy
  zone: ZoneType;
  offset: number;
  headWidth: number;
  
  // Pattern
  distribution: DistributionType;
  density: number;
  symmetry: boolean;
  
  // Element
  shape: ShapeType;
  scaleBase: number;
  scaleVar: number;
  
  // Aesthetics
  colorMode: ColorMode;
  primaryColor: string;
  roughness: number;
  metalness: number;
}

export interface AnimationDef {
  active: boolean;
  min: number;
  max: number;
  speed: number;
}

export const DEFAULT_CONFIG: MaskConfig = {
  zone: 'full',
  offset: 0.15, 
  headWidth: 1.45,
  distribution: 'spiral', // Fixed type casting from previous version
  density: 400,
  symmetry: true,
  shape: 'cone',
  scaleBase: 0.08,
  scaleVar: 0.5,
  colorMode: 'depth',
  primaryColor: '#00ff9d',
  roughness: 0.2,
  metalness: 0.8
};

export interface Preset {
  name: string;
  config: Partial<MaskConfig>;
}

export const PRESETS: Preset[] = [
  {
    name: "Spike",
    config: {
      zone: 'full',
      shape: 'cone',
      density: 250,
      offset: 0.1,
      scaleBase: 0.06,
      scaleVar: 1.2,
      distribution: 'spiral',
      colorMode: 'depth'
    }
  },
  {
    name: "Cyber",
    config: {
      zone: 'domino',
      shape: 'box',
      density: 120,
      offset: 0.2,
      scaleBase: 0.15,
      scaleVar: 0.1,
      distribution: 'grid',
      colorMode: 'solid',
      primaryColor: '#00ccff'
    }
  },
  {
    name: "Organic",
    config: {
      zone: 'respirator',
      shape: 'sphere',
      density: 500,
      offset: 0.05,
      scaleBase: 0.05,
      scaleVar: 0.8,
      distribution: 'random',
      colorMode: 'normal'
    }
  }
];
