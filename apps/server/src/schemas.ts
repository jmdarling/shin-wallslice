import { Type, type Static } from '@sinclair/typebox';
import {
  CUSTOM_SIZE_MAX,
  CUSTOM_SIZE_MIN,
  DEVICE_CATEGORIES,
  type DetectionMethod,
} from '@shin-wallslice/core';

// TypeBox mirrors of the wire types in @shin-wallslice/core/api.ts.

function StringEnum<T extends string>(values: readonly T[]) {
  return Type.Unsafe<T>({ type: 'string', enum: [...values] });
}

const DETECTION_METHODS: readonly DetectionMethod[] = [
  'saliency',
  'faces',
  'attention',
  'center',
  'manual',
];

/** Binary responses (PNG, ZIP, JPEG) are sent as buffers/streams and bypass serialization. */
export const BinaryResponseSchema = Type.Unknown({ description: 'binary body' });

const Unit = Type.Number({ minimum: 0, maximum: 1 });

export const SizeSchema = Type.Object({
  width: Type.Integer({ minimum: 1 }),
  height: Type.Integer({ minimum: 1 }),
});

export const NormRectSchema = Type.Object({ x: Unit, y: Unit, width: Unit, height: Unit });
export const NormPointSchema = Type.Object({ x: Unit, y: Unit });

export const CropOverrideSchema = Type.Object(
  {
    center: Type.Optional(NormPointSchema),
    zoom: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1 })),
  },
  { additionalProperties: false },
);

const Dimension = Type.Integer({ minimum: CUSTOM_SIZE_MIN, maximum: CUSTOM_SIZE_MAX });

export const TargetRequestSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('device'),
      deviceId: Type.String({ minLength: 1, maxLength: 80 }),
      override: Type.Optional(CropOverrideSchema),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('custom'),
      width: Dimension,
      height: Dimension,
      label: Type.Optional(Type.String({ maxLength: 80 })),
      rotates: Type.Optional(Type.Boolean()),
      override: Type.Optional(CropOverrideSchema),
    },
    { additionalProperties: false },
  ),
]);

export const RenderRequestSchema = Type.Object(
  {
    targets: Type.Array(TargetRequestSchema, { minItems: 1, maxItems: 64 }),
    name: Type.String({ maxLength: 200 }),
    subject: Type.Optional(
      Type.Object({ box: NormRectSchema, focal: NormPointSchema }, { additionalProperties: false }),
    ),
  },
  { additionalProperties: false },
);
export type RenderRequestBody = Static<typeof RenderRequestSchema>;

export const SourceParamsSchema = Type.Object({ id: Type.String({ maxLength: 64 }) });

export const UrlSourceRequestSchema = Type.Object(
  { url: Type.String({ minLength: 1, maxLength: 4096 }) },
  { additionalProperties: false },
);

export const ErrorResponseSchema = Type.Object({
  error: Type.Object({ code: Type.String(), message: Type.String() }),
});

export const SourceResponseSchema = Type.Object({
  id: Type.String(),
  width: Type.Integer(),
  height: Type.Integer(),
  proxyUrl: Type.String(),
  proxyWidth: Type.Integer(),
  proxyHeight: Type.Integer(),
  baseName: Type.String(),
});

export const SubjectResponseSchema = Type.Object({
  box: NormRectSchema,
  focal: NormPointSchema,
  confidence: Type.Number(),
  method: StringEnum(DETECTION_METHODS),
});

export const DeviceSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  brand: Type.String(),
  category: StringEnum(DEVICE_CATEGORIES),
  year: Type.Optional(Type.Integer()),
  resolution: SizeSchema,
  rotates: Type.Optional(Type.Boolean()),
  aliases: Type.Optional(Type.Array(Type.String())),
  source: Type.Optional(Type.String()),
});

export const DevicesResponseSchema = Type.Object({ devices: Type.Array(DeviceSchema) });

export const ConfigResponseSchema = Type.Object({
  version: Type.String(),
  outputVolumeAvailable: Type.Boolean(),
  namingEnabled: Type.Boolean(),
  limits: Type.Object({
    maxUploadMb: Type.Integer(),
    maxInputMegapixels: Type.Integer(),
  }),
});

export const HealthResponseSchema = Type.Object({
  status: Type.Literal('ok'),
  detector: Type.Object({ name: Type.String(), modelsLoaded: Type.Boolean() }),
});

export const NameSuggestionResponseSchema = Type.Object({ name: Type.String() });
export const SaveResponseSchema = Type.Object({ files: Type.Array(Type.String()) });

export const errorResponses = {
  400: ErrorResponseSchema,
  404: ErrorResponseSchema,
  413: ErrorResponseSchema,
  415: ErrorResponseSchema,
  503: ErrorResponseSchema,
};
