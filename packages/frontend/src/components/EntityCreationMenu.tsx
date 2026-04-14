import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@motionlab/ui';
import {
  Activity,
  ArrowUpDown,
  Box,
  Circle,
  Crosshair,
  Cylinder,
  Gauge,
  Import,
  Link2,
  Lock,
  MoveHorizontal,
  Plus,
  Radio,
  RotateCcw,
  RotateCw,
  Zap,
} from 'lucide-react';

import { executeCommand } from '../commands/registry.js';
import { useCmdDisabled } from '../hooks/use-cmd-disabled.js';

export function EntityCreationMenu() {
  const createBodyDisabled = useCmdDisabled('create.body');
  const importDisabled = useCmdDisabled('create.import');
  const datumDisabled = useCmdDisabled('create.datum');
  const jointDisabled = useCmdDisabled('create.joint');
  const forceDisabled = useCmdDisabled('create.force.point');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="flex size-8 items-center justify-center rounded-[var(--panel-radius)] bg-[var(--layer-raised)] text-text-tertiary hover:bg-[var(--layer-raised-hover)] hover:text-text-primary">
            <Plus className="size-3.5" />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={createBodyDisabled}
          onSelect={() => executeCommand('create.body')}
        >
          <Box className="size-4" />
          Create Body
          <DropdownMenuShortcut>B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={importDisabled}
          onSelect={() => executeCommand('create.import')}
        >
          <Import className="size-4" />
          Import Geometry
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled={datumDisabled} onSelect={() => executeCommand('create.datum')}>
          <Crosshair className="size-4" />
          Create Datum
          <DropdownMenuShortcut>D</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Joint submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={jointDisabled}>
            <Link2 className="size-4" />
            Create Joint
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.revolute')}>
              <RotateCw className="size-4" />
              Revolute
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.prismatic')}>
              <MoveHorizontal className="size-4" />
              Prismatic
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.fixed')}>
              <Lock className="size-4" />
              Fixed
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.spherical')}>
              <Circle className="size-4" />
              Spherical
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.cylindrical')}>
              <Cylinder className="size-4" />
              Cylindrical
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.planar')}>
              <MoveHorizontal className="size-4" />
              Planar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.universal')}>
              <RotateCw className="size-4" />
              Universal
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.distance')}>
              <Link2 className="size-4" />
              Distance
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.point-line')}>
              <MoveHorizontal className="size-4" />
              Point-Line
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.joint.point-plane')}>
              <Circle className="size-4" />
              Point-Plane
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Force submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={forceDisabled}>
            <Zap className="size-4" />
            Create Force
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => executeCommand('create.force.point')}>
              <Zap className="size-4" />
              Point Force
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.force.torque')}>
              <RotateCcw className="size-4" />
              Point Torque
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => executeCommand('create.force.spring-damper')}>
              <Activity className="size-4" />
              Spring-Damper
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Actuator submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled>
            <Gauge className="size-4" />
            Create Actuator
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem disabled>
              <Gauge className="size-4" />
              Revolute Motor
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <ArrowUpDown className="size-4" />
              Prismatic Motor
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Sensor submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled>
            <Radio className="size-4" />
            Create Sensor
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem disabled>
              <Radio className="size-4" />
              Accelerometer
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Radio className="size-4" />
              Gyroscope
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Radio className="size-4" />
              Tachometer
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Radio className="size-4" />
              Encoder
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
