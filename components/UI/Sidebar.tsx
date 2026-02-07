import React, { useState } from 'react';
import { MaskConfig, PRESETS, ShapeType, ZoneType, DistributionType, ColorMode, AnimationDef } from '../../types';
import { Settings2, Download, Upload, Monitor, Box, Layers, Palette, ScanFace, Printer, ChevronDown, Cpu, Network, Zap, Fingerprint, Activity, PlayCircle } from 'lucide-react';

interface SidebarProps {
  config: MaskConfig;
  updateConfig: (key: keyof MaskConfig, value: any) => void;
  animations: Record<string, AnimationDef>;
  updateAnimation: (key: string, def: Partial<AnimationDef>) => void;
  onExport: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleGhost: () => void;
  ghostVisible: boolean;
  applyPreset: (p: any) => void;
  usingCustomMesh: boolean;
  onStartScan: () => void;
}

const Accordion = ({ title, icon: Icon, children, defaultOpen = false }: { title: string, icon: any, children?: React.ReactNode, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-glassBorder last:border-0">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="w-full flex items-center justify-between py-4 group"
      >
        <span className="flex items-center gap-3 text-xs font-light tracking-[0.2em] uppercase text-textDim group-hover:text-holo transition-colors">
          <Icon size={12} className="opacity-70" />
          {title}
        </span>
        <ChevronDown size={12} className={`text-textDim transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[500px] opacity-100 pb-4' : 'max-h-0 opacity-0'}`}>
        <div className="space-y-4 px-1">
          {children}
        </div>
      </div>
    </div>
  );
};

const RangeControl = ({ paramKey, label, value, min, max, step, onChange, animation, onUpdateAnimation }: any) => {
  const isAnimating = animation?.active || false;

  return (
    <div className="group">
      <div className="flex justify-between mb-2 items-center">
        <span className="text-[10px] uppercase tracking-wider text-textDim group-hover:text-holo transition-colors">{label}</span>
        <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-textDim w-8 text-right">{typeof value === 'number' ? value.toFixed(2) : value}</span>
            {onUpdateAnimation && (
                <button 
                    onClick={() => onUpdateAnimation(paramKey, { active: !isAnimating, min: min, max: max, speed: 1.0 })}
                    className={`p-1 rounded transition-colors ${isAnimating ? 'text-accent bg-accent/10' : 'text-textDim hover:text-white'}`}
                    title="Toggle Dynamics Loop"
                >
                    <Activity size={10} />
                </button>
            )}
        </div>
      </div>
      
      {/* Main Slider */}
      <div className={`relative h-px w-full transition-colors duration-300 ${isAnimating ? 'bg-accent/30' : 'bg-gray-800'}`}>
          <input 
              type="range" min={min} max={max} step={step}
              value={value}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              disabled={isAnimating}
              className={`absolute top-1/2 -translate-y-1/2 w-full h-4 opacity-0 z-10 ${isAnimating ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          />
          <div 
              className={`absolute top-0 left-0 h-full transition-all duration-300 ${isAnimating ? 'bg-accent animate-pulse' : 'bg-holo'}`}
              style={{ width: `${((value - min) / (max - min)) * 100}%` }}
          />
          <div 
              className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-black border rounded-full transition-all duration-300 ${isAnimating ? 'border-accent' : 'border-holo'}`}
              style={{ left: `${((value - min) / (max - min)) * 100}%` }}
          />
      </div>

      {/* Animation Controls (Dynamics) */}
      {isAnimating && (
          <div className="mt-3 p-2 bg-white/5 border-l-2 border-accent rounded-r-sm">
              <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] uppercase text-accent tracking-widest">Dynamics Loop</span>
                  <span className="text-[9px] font-mono text-textDim">SINE WAVE</span>
              </div>
              
              {/* Range Limits */}
              <div className="flex gap-2 mb-2">
                  <div className="flex-1">
                      <label className="text-[8px] text-textDim block mb-1">LOOP MIN</label>
                      <input 
                        type="number" 
                        value={animation.min}
                        step={step}
                        onChange={(e) => onUpdateAnimation(paramKey, { min: parseFloat(e.target.value) })}
                        className="w-full bg-black border border-glassBorder text-[9px] text-white p-1 outline-none focus:border-accent"
                      />
                  </div>
                  <div className="flex-1">
                      <label className="text-[8px] text-textDim block mb-1">LOOP MAX</label>
                       <input 
                        type="number" 
                        value={animation.max}
                        step={step}
                        onChange={(e) => onUpdateAnimation(paramKey, { max: parseFloat(e.target.value) })}
                        className="w-full bg-black border border-glassBorder text-[9px] text-white p-1 outline-none focus:border-accent"
                      />
                  </div>
              </div>

              {/* Speed */}
              <div>
                  <div className="flex justify-between">
                    <label className="text-[8px] text-textDim block mb-1">SPEED (Hz)</label>
                    <span className="text-[8px] text-accent">{animation.speed?.toFixed(1)}x</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="5.0" step="0.1"
                    value={animation.speed || 1.0}
                    onChange={(e) => onUpdateAnimation(paramKey, { speed: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
                  />
              </div>
          </div>
      )}
    </div>
  );
};

// Memoize the Sidebar to prevents lag when App.tsx re-renders at 60fps
const Sidebar: React.FC<SidebarProps> = React.memo(({ 
  config, updateConfig, animations, updateAnimation, onExport, onUpload, onToggleGhost, ghostVisible, applyPreset, usingCustomMesh, onStartScan 
}) => {
  
  const handlePrintMarker = () => {
      const win = window.open('', '_blank');
      win?.document.write('<html><body>Print Logic Triggered</body></html>'); 
  };

  const getAnim = (key: string) => animations[key] || { active: false, min: 0, max: 1, speed: 1 };

  return (
    <div className="absolute top-0 left-0 h-full w-96 z-50 p-6 flex flex-col pointer-events-none">
      
      {/* 2040 Header */}
      <div className="glass-panel rounded-t-lg p-6 pointer-events-auto">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-xl font-light text-holo tracking-tight">NEURO<span className="font-bold">MASK</span></h1>
                <div className="flex items-center gap-2 mt-1">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-mono text-textDim uppercase">Sys.Ver 9.4.2 // Connected</span>
                </div>
            </div>
            <div className="text-right">
                <div className="text-[10px] font-mono text-textDim">LATENCY</div>
                <div className="text-xs font-mono text-holo">4ms</div>
            </div>
        </div>

        <div className="mt-6 flex gap-2">
            <button 
                onClick={onStartScan}
                className="flex-1 py-3 border border-glassBorder hover:border-holo/50 bg-white/5 hover:bg-white/10 text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2"
            >
                <ScanFace size={14} />
                Init_Scan
            </button>
            <button 
                onClick={handlePrintMarker}
                className="flex-1 py-3 border border-glassBorder hover:border-holo/50 bg-white/5 hover:bg-white/10 text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2"
            >
                <Printer size={14} />
                Fab_Target
            </button>
        </div>
      </div>

      {/* Scrollable Controls */}
      <div className="glass-panel border-t-0 flex-1 overflow-y-auto px-6 pointer-events-auto no-scrollbar">
        
        {/* Presets - Minimal Dots */}
        <div className="py-6 flex gap-2 justify-center border-b border-glassBorder">
            {PRESETS.map(preset => (
                <button
                    key={preset.name}
                    onClick={() => applyPreset(preset.config)}
                    className="px-4 py-1.5 text-[10px] uppercase border border-glassBorder hover:bg-white/10 hover:border-holo transition-all rounded-full"
                >
                    {preset.name}
                </button>
            ))}
        </div>

        <Accordion title="Morphology" icon={Monitor} defaultOpen={true}>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[9px] uppercase text-textDim">Target Zone</label>
                    <select 
                        value={config.zone}
                        onChange={(e) => updateConfig('zone', e.target.value as ZoneType)}
                        className="w-full bg-black/40 border border-glassBorder text-xs p-2 outline-none focus:border-holo"
                    >
                        <option value="full">Full_Face</option>
                        <option value="domino">Ocular_Band</option>
                        <option value="respirator">Filter_Unit</option>
                        <option value="jaw">Mandible</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] uppercase text-textDim">Form Factor</label>
                    <select 
                        value={config.shape}
                        onChange={(e) => updateConfig('shape', e.target.value as ShapeType)}
                        className="w-full bg-black/40 border border-glassBorder text-xs p-2 outline-none focus:border-holo"
                    >
                        <option value="cone">Spike_Arr</option>
                        <option value="sphere">Orb_Net</option>
                        <option value="box">Voxel_Grid</option>
                        <option value="torus">Link_Mesh</option>
                    </select>
                </div>
            </div>
            <RangeControl 
                paramKey="headWidth" label="Cranial Width" value={config.headWidth} min={1.0} max={2.0} step={0.01} 
                onChange={(v: number) => updateConfig('headWidth', v)} 
                animation={getAnim('headWidth')} onUpdateAnimation={updateAnimation}
            />
            <RangeControl 
                paramKey="offset" label="Dermis Offset" value={config.offset} min={0} max={0.5} step={0.01} 
                onChange={(v: number) => updateConfig('offset', v)} 
                animation={getAnim('offset')} onUpdateAnimation={updateAnimation}
            />
        </Accordion>

        <Accordion title="Algorithm" icon={Layers}>
             <RangeControl label="Unit Density" value={config.density} min={50} max={1500} step={10} onChange={(v: number) => updateConfig('density', v)} />
             <div className="flex items-center justify-between py-2">
                <span className="text-[10px] uppercase text-textDim">Bilateral Symmetry</span>
                <button 
                    onClick={() => updateConfig('symmetry', !config.symmetry)}
                    className={`w-8 h-4 rounded-full border border-glassBorder relative transition-colors ${config.symmetry ? 'bg-holo/20 border-holo' : 'bg-transparent'}`}
                >
                    <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${config.symmetry ? 'left-4 shadow-[0_0_5px_white]' : 'left-0.5 opacity-50'}`} />
                </button>
             </div>
             <div className="pt-2">
                <label className="text-[9px] uppercase text-textDim block mb-2">Distribution Logic</label>
                <div className="flex gap-1">
                    {['grid', 'spiral', 'random'].map((d) => (
                        <button 
                            key={d}
                            onClick={() => updateConfig('distribution', d as DistributionType)}
                            className={`flex-1 py-1 text-[9px] uppercase border ${config.distribution === d ? 'bg-holo text-black border-holo' : 'border-glassBorder text-textDim hover:border-gray-500'}`}
                        >
                            {d}
                        </button>
                    ))}
                </div>
             </div>
        </Accordion>

        <Accordion title="Materiality" icon={Palette}>
            <RangeControl 
                paramKey="scaleBase" label="Element Scale" value={config.scaleBase} min={0.01} max={0.3} step={0.005} 
                onChange={(v: number) => updateConfig('scaleBase', v)} 
                animation={getAnim('scaleBase')} onUpdateAnimation={updateAnimation}
            />
            <RangeControl 
                paramKey="roughness" label="Roughness" value={config.roughness} min={0} max={1} step={0.1} 
                onChange={(v: number) => updateConfig('roughness', v)} 
                animation={getAnim('roughness')} onUpdateAnimation={updateAnimation}
            />
            <RangeControl label="Metalness" value={config.metalness} min={0} max={1} step={0.1} onChange={(v: number) => updateConfig('metalness', v)} />
            <div className="pt-3">
                 <label className="text-[9px] uppercase text-textDim block mb-2">Reflectance Mode</label>
                 <div className="grid grid-cols-3 gap-1">
                     <button onClick={() => updateConfig('colorMode', 'normal')} className={`text-[9px] border py-1 ${config.colorMode === 'normal' ? 'border-holo text-holo' : 'border-glassBorder text-textDim'}`}>NORMAL</button>
                     <button onClick={() => updateConfig('colorMode', 'depth')} className={`text-[9px] border py-1 ${config.colorMode === 'depth' ? 'border-holo text-holo' : 'border-glassBorder text-textDim'}`}>DEPTH</button>
                     <button onClick={() => updateConfig('colorMode', 'solid')} className={`text-[9px] border py-1 ${config.colorMode === 'solid' ? 'border-holo text-holo' : 'border-glassBorder text-textDim'}`}>SOLID</button>
                 </div>
            </div>
            {config.colorMode === 'solid' && (
                <div className="pt-3 flex justify-between items-center">
                    <span className="text-[10px] uppercase text-textDim">Base Pigment</span>
                    <input type="color" value={config.primaryColor} onChange={(e) => updateConfig('primaryColor', e.target.value)} className="w-4 h-4 rounded-full border-none p-0 cursor-pointer bg-transparent" />
                </div>
            )}
        </Accordion>
        
        {/* 2040 CAPABILITIES MODULE */}
        <div className="mt-8 mb-6">
            <h3 className="text-[9px] uppercase tracking-[0.3em] text-textDim mb-4 border-b border-glassBorder pb-2">System Capabilities // 2040</h3>
            <div className="space-y-4">
                
                <div className="flex gap-3">
                    <div className="mt-0.5 text-accent"><Network size={14} /></div>
                    <div>
                        <h4 className="text-xs text-holo font-medium">BCI-Generative Coupling</h4>
                        <p className="text-[10px] text-textDim leading-relaxed mt-1">
                            Direct neural link interprets theta waves to generate topology in real-time. No manual input required.
                        </p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="mt-0.5 text-accent"><Fingerprint size={14} /></div>
                    <div>
                        <h4 className="text-xs text-holo font-medium">Bio-Responsive Smart Matter</h4>
                        <p className="text-[10px] text-textDim leading-relaxed mt-1">
                            Design exports to 4D-printable polymers that react to cortisol levels, changing opacity based on wearer stress.
                        </p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="mt-0.5 text-accent"><Cpu size={14} /></div>
                    <div>
                        <h4 className="text-xs text-holo font-medium">Self-Assembling Nanolattice</h4>
                        <p className="text-[10px] text-textDim leading-relaxed mt-1">
                            Fabrication target: Autonomous nanobot swarm construction. Build time: 0.04s.
                        </p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="mt-0.5 text-accent"><Zap size={14} /></div>
                    <div>
                        <h4 className="text-xs text-holo font-medium">Holographic Weaving</h4>
                        <p className="text-[10px] text-textDim leading-relaxed mt-1">
                            Physical metamaterial anchors support high-fidelity hard-light projections for infinite cosmetic reconfiguration.
                        </p>
                    </div>
                </div>

            </div>
        </div>

      </div>

      {/* Footer Actions */}
      <div className="glass-panel border-t-0 rounded-b-lg p-4 pointer-events-auto space-y-2">
         <label className="flex items-center justify-between text-[10px] uppercase text-textDim cursor-pointer hover:text-holo transition-colors">
            <span className="flex items-center gap-2"><Upload size={12}/> Import Topology</span>
            <input type="file" accept=".obj" className="hidden" onChange={onUpload} />
         </label>
         <button onClick={onExport} className="w-full flex items-center justify-between text-[10px] uppercase text-textDim hover:text-holo transition-colors">
            <span className="flex items-center gap-2"><Download size={12}/> Fabricate Protocol</span>
         </button>
         <button onClick={onToggleGhost} className="w-full flex items-center justify-between text-[10px] uppercase text-textDim hover:text-holo transition-colors">
            <span className="flex items-center gap-2"><Settings2 size={12}/> {ghostVisible ? 'Hide' : 'Show'} Phantom</span>
         </button>
      </div>

    </div>
  );
});

export default Sidebar;