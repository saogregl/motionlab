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
}

declare global {
  interface Window {
    motionlab?: MotionLabAPI;
  }
}
