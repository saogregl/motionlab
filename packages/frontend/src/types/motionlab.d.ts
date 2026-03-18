export interface MotionLabEndpoint {
  host: string;
  port: number;
  sessionToken?: string;
}

export interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<MotionLabEndpoint | null>;
  openFileDialog(options?: {
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
  windowIsMaximized(): Promise<boolean>;
  onWindowMaximizedChange(callback: (maximized: boolean) => void): void;
}

declare global {
  interface Window {
    motionlab?: MotionLabAPI;
  }
}
