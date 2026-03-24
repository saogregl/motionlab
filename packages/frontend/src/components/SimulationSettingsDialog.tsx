import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InspectorSection,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@motionlab/ui';
import { Beaker, FlaskConical, Gauge, Zap } from 'lucide-react';

import type { IntegratorType, SettingsPreset, SolverType } from '../stores/simulation-settings.js';
import { useSimulationSettingsStore } from '../stores/simulation-settings.js';

interface SimulationSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const PRESET_ITEMS: { key: SettingsPreset; label: string; icon: React.ReactNode }[] = [
  { key: 'quick-preview', label: 'Quick', icon: <Zap className="size-3" /> },
  { key: 'balanced', label: 'Balanced', icon: <Gauge className="size-3" /> },
  { key: 'high-accuracy', label: 'Accurate', icon: <FlaskConical className="size-3" /> },
  { key: 'contact-heavy', label: 'Contact', icon: <Beaker className="size-3" /> },
];

export function SimulationSettingsDialog({ open, onClose }: SimulationSettingsDialogProps) {
  const store = useSimulationSettingsStore();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Simulation Settings</DialogTitle>
          <DialogDescription>Configure solver parameters for the next compilation.</DialogDescription>
        </DialogHeader>

        {/* Preset row */}
        <div className="flex gap-1">
          {PRESET_ITEMS.map(({ key, label, icon }) => (
            <Button
              key={key}
              size="sm"
              variant="outline"
              className="flex-1 gap-1"
              onClick={() => store.applySettingsPreset(key)}
            >
              {icon}
              {label}
            </Button>
          ))}
        </div>

        <Tabs defaultValue="basic">
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="flex flex-col gap-3 pt-2">
            <BasicTab />
          </TabsContent>

          <TabsContent value="advanced" className="flex flex-col gap-2 pt-2">
            <AdvancedTab />
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => store.resetToDefaults()}>
            Reset to Defaults
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BasicTab() {
  const duration = useSimulationSettingsStore((s) => s.duration);
  const timestep = useSimulationSettingsStore((s) => s.timestep);
  const gravity = useSimulationSettingsStore((s) => s.gravity);
  const setDuration = useSimulationSettingsStore((s) => s.setDuration);
  const setTimestep = useSimulationSettingsStore((s) => s.setTimestep);
  const setGravity = useSimulationSettingsStore((s) => s.setGravity);
  const applyPreset = useSimulationSettingsStore((s) => s.applyPreset);

  const timestepStr = String(timestep);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Duration (s)</label>
        <NumericInput
          variant="field"
          value={duration}
          onChange={setDuration}
          min={0.1}
          max={3600}
          step={1}
          precision={1}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Timestep (s)</label>
        <Select value={timestepStr} onValueChange={(v) => { if (v) setTimestep(parseFloat(v)); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0.01">10 ms (fast)</SelectItem>
            <SelectItem value="0.001">1 ms (default)</SelectItem>
            <SelectItem value="0.0005">0.5 ms (fine)</SelectItem>
            <SelectItem value="0.0001">0.1 ms (precise)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Gravity Preset</label>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => applyPreset('earth')}>Earth</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset('moon')}>Moon</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset('mars')}>Mars</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset('zero-g')}>Zero-G</Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Gravity (m/s²)</label>
        <div className="grid grid-cols-3 gap-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-2xs text-muted-foreground">X</span>
            <NumericInput variant="field" value={gravity.x} onChange={(v) => setGravity({ ...gravity, x: v })} step={0.1} precision={2} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-2xs text-muted-foreground">Y</span>
            <NumericInput variant="field" value={gravity.y} onChange={(v) => setGravity({ ...gravity, y: v })} step={0.1} precision={2} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-2xs text-muted-foreground">Z</span>
            <NumericInput variant="field" value={gravity.z} onChange={(v) => setGravity({ ...gravity, z: v })} step={0.1} precision={2} />
          </div>
        </div>
      </div>
    </>
  );
}

function AdvancedTab() {
  return (
    <>
      <SolverSection />
      <ContactSection />
    </>
  );
}

function SolverSection() {
  const solverType = useSimulationSettingsStore((s) => s.solverType);
  const maxIterations = useSimulationSettingsStore((s) => s.maxIterations);
  const tolerance = useSimulationSettingsStore((s) => s.tolerance);
  const integratorType = useSimulationSettingsStore((s) => s.integratorType);
  const setSolverType = useSimulationSettingsStore((s) => s.setSolverType);
  const setMaxIterations = useSimulationSettingsStore((s) => s.setMaxIterations);
  const setTolerance = useSimulationSettingsStore((s) => s.setTolerance);
  const setIntegratorType = useSimulationSettingsStore((s) => s.setIntegratorType);

  return (
    <InspectorSection title="Solver">
      <div className="flex flex-col gap-2 ps-2 pe-1 pb-1">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Solver Type</label>
          <Select
            value={solverType}
            onValueChange={(v) => { if (v) setSolverType(v as SolverType); }}
          >
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="psor">PSOR (fast, general purpose)</SelectItem>
              <SelectItem value="barzilai-borwein">Barzilai-Borwein (ill-conditioned)</SelectItem>
              <SelectItem value="apgd">APGD (large systems, contacts)</SelectItem>
              <SelectItem value="minres">MINRES (most precise, slowest)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Max Iterations</label>
            <NumericInput
              variant="field"
              value={maxIterations}
              onChange={setMaxIterations}
              min={10}
              max={5000}
              step={10}
              precision={0}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Tolerance</label>
            <NumericInput
              variant="field"
              value={tolerance}
              onChange={setTolerance}
              min={1e-12}
              max={1e-3}
              step={0}
              precision={12}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Integrator</label>
          <Select
            value={integratorType}
            onValueChange={(v) => { if (v) setIntegratorType(v as IntegratorType); }}
          >
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="euler-implicit-linearized">Euler Implicit (fast, stable)</SelectItem>
              <SelectItem value="hht">HHT (second-order, stiff systems)</SelectItem>
              <SelectItem value="newmark">Newmark (structural dynamics)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </InspectorSection>
  );
}

function ContactSection() {
  const enableContact = useSimulationSettingsStore((s) => s.enableContact);
  const friction = useSimulationSettingsStore((s) => s.friction);
  const restitution = useSimulationSettingsStore((s) => s.restitution);
  const compliance = useSimulationSettingsStore((s) => s.compliance);
  const contactDamping = useSimulationSettingsStore((s) => s.contactDamping);
  const setEnableContact = useSimulationSettingsStore((s) => s.setEnableContact);
  const setFriction = useSimulationSettingsStore((s) => s.setFriction);
  const setRestitution = useSimulationSettingsStore((s) => s.setRestitution);
  const setCompliance = useSimulationSettingsStore((s) => s.setCompliance);
  const setContactDamping = useSimulationSettingsStore((s) => s.setContactDamping);

  return (
    <InspectorSection title="Contact">
      <div className="flex flex-col gap-2 ps-2 pe-1 pb-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Enable Contact Detection</label>
          <Switch size="sm" checked={enableContact} onCheckedChange={setEnableContact} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Friction</label>
            <NumericInput
              variant="field"
              value={friction}
              onChange={setFriction}
              min={0}
              max={2}
              step={0.05}
              precision={2}
              disabled={!enableContact}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Restitution</label>
            <NumericInput
              variant="field"
              value={restitution}
              onChange={setRestitution}
              min={0}
              max={1}
              step={0.1}
              precision={2}
              disabled={!enableContact}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Compliance</label>
            <NumericInput
              variant="field"
              value={compliance}
              onChange={setCompliance}
              min={0}
              max={1}
              step={0}
              precision={8}
              disabled={!enableContact}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Damping</label>
            <NumericInput
              variant="field"
              value={contactDamping}
              onChange={setContactDamping}
              min={0}
              max={1}
              step={0}
              precision={8}
              disabled={!enableContact}
            />
          </div>
        </div>
      </div>
    </InspectorSection>
  );
}
