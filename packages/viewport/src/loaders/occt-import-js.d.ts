declare module 'occt-import-js' {
  export interface OcctImportResult {
    success: boolean;
    root: OcctImportResultNode;
    meshes: OcctImportMesh[];
  }

  export interface OcctImportResultNode {
    name: string;
    meshes: number[];
    children: OcctImportResultNode[];
  }

  export interface OcctImportMesh {
    name: string;
    color: [number, number, number];
    brep_faces: OcctBrepFace[];
    attributes: {
      position: { array: number[] };
      normal: { array: number[] };
    };
    index: { array: number[] };
  }

  export interface OcctBrepFace {
    first: number;
    last: number;
    color: [number, number, number] | null;
  }

  export interface OcctImportParams {
    linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
    linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value';
    linearDeflection?: number;
    angularDeflection?: number;
  }

  export interface OcctImporter {
    ReadStepFile(
      content: Uint8Array,
      params?: OcctImportParams | null,
    ): OcctImportResult;
    ReadIgesFile(
      content: Uint8Array,
      params?: OcctImportParams | null,
    ): OcctImportResult;
    ReadBrepFile(
      content: Uint8Array,
      params?: OcctImportParams | null,
    ): OcctImportResult;
  }

  export default function occtimportjs(options?: {
    locateFile?: (path: string) => string;
  }): Promise<OcctImporter>;
}
