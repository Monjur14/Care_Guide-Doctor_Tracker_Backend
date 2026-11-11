/**
 * OpenAPI 3.1 document. Request bodies and query parameters are generated from
 * the same Zod schemas the API validates with (packages/shared), so the docs
 * can't drift from validation. Response schemas live in ./schemas and are
 * checked against real responses by tests/docs.test.ts.
 */
import { z } from 'zod';
import {
  doctorCreateSchema,
  doctorListQuerySchema,
  doctorPatientsQuerySchema,
  doctorUpdateSchema,
  loginSchema,
  patientCreateSchema,
  patientListQuerySchema,
  patientUpdateSchema,
  patientsPerDoctorQuerySchema,
  timelineQuerySchema,
} from '@doctor-tracker/shared';
import { SESSION_COOKIE } from '../modules/auth/session';
import * as S from './schemas';

type Json = Record<string, unknown>;

const COMPONENT_REF = '#/components/schemas/';

const toJsonSchemaOptions = {
  unrepresentable: 'any' as const,
  // z.coerce.date() has no JSON representation; document it as an ISO string.
  override: (ctx: { zodSchema: { _zod: { def: { type: string } } }; jsonSchema: Json }) => {
    if (ctx.zodSchema._zod.def.type === 'date') {
      ctx.jsonSchema.type = 'string';
      ctx.jsonSchema.format = 'date-time';
    }
  },
};

/** Converts a Zod schema to JSON Schema, pointing named sub-schemas at components. */
function schema(zodSchema: z.ZodType, io: 'input' | 'output' = 'output'): Json {
  const { $schema, $defs, ...rest } = z.toJSONSchema(zodSchema, { ...toJsonSchemaOptions, io }) as Json;
  void $schema;
  void $defs;
  return JSON.parse(JSON.stringify(rest).replaceAll('"#/$defs/', `"${COMPONENT_REF}`)) as Json;
}

function componentSchemas(): Json {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    ...toJsonSchemaOptions,
    uri: (id) => `${COMPONENT_REF}${id}`,
  }) as { schemas: Record<string, Json> };
  return Object.fromEntries(
    Object.entries(schemas).map(([name, { $schema, $id, ...rest }]) => {
      void $schema;
      void $id;
      return [name, rest];
    }),
  );
}

/** Turns a Zod object schema into OpenAPI query parameters. */
function queryParams(zodSchema: z.ZodType): Json[] {
  const json = schema(zodSchema, 'input') as { properties?: Record<string, Json>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, prop]) => {
    // Drop `example`: Swagger UI would pre-fill optional filters with it (e.g. from = to).
    const { description, example, ...rest } = prop;
    void example;
    return {
      name,
      in: 'query',
      required: json.required?.includes(name) ?? false,
      ...(description ? { description } : {}),
      schema: rest,
    };
  });
}

const json = (zodSchema: z.ZodType, extra: Json = {}) => ({
  content: { 'application/json': { schema: schema(zodSchema), ...extra } },
});

const body = (zodSchema: z.ZodType, example: Json) => ({
  required: true,
  content: { 'application/json': { schema: schema(zodSchema, 'input'), example } },
});

const idParam = (name = 'id', description = 'Resource id') => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', pattern: '^[a-f\\d]{24}$' },
});

const ref = (name: string) => ({ $ref: `#/components/responses/${name}` });
const errors = (...names: string[]) => Object.fromEntries(names.map((n) => [n, ref(n)]));
const PROTECTED_ERRORS = ['401', '429', '500'];

const doctorExample = {
  name: 'Dr. Ayesha Rahman',
  specialization: 'Cardiology',
  hospital: 'Square Hospital',
  phone: '+880 1711 123456',
  email: 'ayesha.rahman@squarehospital.dev',
};

const patientExample = {
  name: 'Karim Hossain',
  age: 45,
  gender: 'male',
  phone: '+880 1811 654321',
  email: 'karim@mail.dev',
  condition: 'Diabetes',
  status: 'admitted',
  admissionDate: '2026-11-08T09:30:00.000Z',
};

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Doctor Tracker API',
      version: '1.0.0',
      description: [
        'REST API for managing doctors and their patients, with search, filtering, pagination and dashboard analytics.',
        '',
        '**Authentication.** Call `POST /auth/login`; the API sets an `HttpOnly` session cookie that the browser sends',
        'automatically. In this page: open *Auth → POST /auth/login → Try it out*, send your credentials, then call any',
        'other endpoint. `POST /auth/logout` revokes every session of the user.',
        '',
        '**Conventions.** Lists return `{ data, meta }`, single resources `{ data }`, errors',
        '`{ error: { code, message, details?, requestId } }`. Unknown body fields are rejected (400). Write requests must use',
        '`Content-Type: application/json`.',
      ].join('\n'),
    },
    servers: [{ url: '/api/v1', description: 'This server' }],
    tags: [
      { name: 'Auth', description: 'Session login / logout' },
      { name: 'Doctors', description: 'Doctor records and their patient lists' },
      { name: 'Patients', description: 'All patients across doctors' },
      { name: 'Stats', description: 'Dashboard analytics' },
      { name: 'Meta', description: 'Options for filter dropdowns' },
      { name: 'System', description: 'Health check' },
    ],
    security: [{ cookieAuth: [] }],
    paths: {
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in',
          description:
            'Sets the session cookie. Returns the same 401 for unknown email and wrong password. After 5 consecutive failures the account is locked for 15 minutes (429).',
          security: [],
          requestBody: body(loginSchema, { email: 'admin@doctortracker.dev', password: 'your-password' }),
          responses: {
            200: {
              description: 'Logged in',
              headers: {
                'Set-Cookie': {
                  description: `\`${SESSION_COOKIE}\` session token (HttpOnly; SameSite=Lax; Secure in production)`,
                  schema: { type: 'string' },
                },
              },
              ...json(S.dataOf(S.authUser)),
            },
            ...errors('400', '401', '413', '415', '429', '500'),
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Log out',
          description: 'Clears the cookie and revokes every token issued to this user.',
          responses: { 204: { description: 'Logged out' }, ...errors(...PROTECTED_ERRORS) },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Current user',
          responses: { 200: { description: 'The logged-in user', ...json(S.dataOf(S.authUser)) }, ...errors(...PROTECTED_ERRORS) },
        },
      },
      '/doctors': {
        get: {
          tags: ['Doctors'],
          summary: 'List doctors',
          description:
            'Paginated. `search` matches word prefixes in name, hospital, specialization, email and phone (case- and accent-insensitive). `from`/`to` filter by the date the doctor was added. Each item includes `patientCount`.',
          parameters: queryParams(doctorListQuerySchema),
          responses: { 200: { description: 'A page of doctors', ...json(S.listOf(S.doctor)) }, ...errors('400', ...PROTECTED_ERRORS) },
        },
        post: {
          tags: ['Doctors'],
          summary: 'Create a doctor',
          requestBody: body(doctorCreateSchema, doctorExample),
          responses: {
            201: { description: 'Created', ...json(S.dataOf(S.doctor)) },
            ...errors('400', '403', '409', '413', '415', ...PROTECTED_ERRORS),
          },
        },
      },
      '/doctors/{id}': {
        parameters: [idParam('id', 'Doctor id')],
        get: {
          tags: ['Doctors'],
          summary: 'Get a doctor',
          responses: { 200: { description: 'The doctor', ...json(S.dataOf(S.doctor)) }, ...errors('400', '404', ...PROTECTED_ERRORS) },
        },
        patch: {
          tags: ['Doctors'],
          summary: 'Update a doctor',
          description: 'Send only the fields to change (at least one).',
          requestBody: body(doctorUpdateSchema, { hospital: 'United Hospital' }),
          responses: {
            200: { description: 'Updated', ...json(S.dataOf(S.doctor)) },
            ...errors('400', '403', '404', '409', '415', ...PROTECTED_ERRORS),
          },
        },
      },
      '/doctors/{id}/patients': {
        parameters: [idParam('id', 'Doctor id')],
        get: {
          tags: ['Doctors'],
          summary: "List a doctor's patients",
          description: 'Same filters as `GET /patients` (`doctorId` is taken from the path).',
          parameters: queryParams(doctorPatientsQuerySchema).filter((p) => p.name !== 'doctorId'),
          responses: {
            200: { description: "A page of the doctor's patients", ...json(S.listOf(S.patient)) },
            ...errors('400', '404', ...PROTECTED_ERRORS),
          },
        },
        post: {
          tags: ['Doctors'],
          summary: 'Add a patient under this doctor',
          requestBody: body(patientCreateSchema, patientExample),
          responses: {
            201: { description: 'Created', ...json(S.dataOf(S.patient)) },
            ...errors('400', '403', '404', '413', '415', ...PROTECTED_ERRORS),
          },
        },
      },
      '/doctors/{id}/patients/{patientId}': {
        parameters: [idParam('id', 'Doctor id'), idParam('patientId', 'Patient id')],
        delete: {
          tags: ['Doctors'],
          summary: "Remove a patient from this doctor's list",
          description: 'Deletes the patient only if it belongs to this doctor; otherwise 404.',
          responses: { 204: { description: 'Deleted' }, ...errors('400', '403', '404', ...PROTECTED_ERRORS) },
        },
      },
      '/patients': {
        get: {
          tags: ['Patients'],
          summary: 'List patients',
          description:
            'Paginated. `search` matches word prefixes in name, email and phone (`01711` also matches `+880 1711 …`). `from`/`to` filter by admission date.',
          parameters: queryParams(patientListQuerySchema),
          responses: { 200: { description: 'A page of patients', ...json(S.listOf(S.patient)) }, ...errors('400', ...PROTECTED_ERRORS) },
        },
      },
      '/patients/{id}': {
        parameters: [idParam('id', 'Patient id')],
        get: {
          tags: ['Patients'],
          summary: 'Get a patient',
          responses: { 200: { description: 'The patient', ...json(S.dataOf(S.patient)) }, ...errors('400', '404', ...PROTECTED_ERRORS) },
        },
        patch: {
          tags: ['Patients'],
          summary: 'Update a patient',
          description: 'Send only the fields to change. `doctorId` reassigns the patient to another doctor.',
          requestBody: body(patientUpdateSchema, { status: 'discharged' }),
          responses: {
            200: { description: 'Updated', ...json(S.dataOf(S.patient)) },
            ...errors('400', '403', '404', '415', ...PROTECTED_ERRORS),
          },
        },
        delete: {
          tags: ['Patients'],
          summary: 'Delete a patient',
          responses: { 204: { description: 'Deleted' }, ...errors('400', '403', '404', ...PROTECTED_ERRORS) },
        },
      },
      '/stats/overview': {
        get: {
          tags: ['Stats'],
          summary: 'Dashboard totals',
          responses: { 200: { description: 'Totals and breakdowns', ...json(S.dataOf(S.statsOverview)) }, ...errors(...PROTECTED_ERRORS) },
        },
      },
      '/stats/patients-per-doctor': {
        get: {
          tags: ['Stats'],
          summary: 'Top doctors by patient count',
          parameters: queryParams(patientsPerDoctorQuerySchema),
          responses: {
            200: { description: 'Most patients first', ...json(S.dataOf(z.array(S.patientsPerDoctorItem))) },
            ...errors('400', ...PROTECTED_ERRORS),
          },
        },
      },
      '/stats/timeline': {
        get: {
          tags: ['Stats'],
          summary: 'Admissions over time',
          description:
            'Admissions per day or month, split by status, in the given IANA time zone. Empty buckets are returned as 0. Defaults: last 30 days (`day`) or last 12 months (`month`). Max range: 366 days (`day`), 5 years (`month`).',
          parameters: queryParams(timelineQuerySchema),
          responses: {
            200: { description: 'One point per bucket, oldest first', ...json(S.dataOf(z.array(S.timelinePoint))) },
            ...errors('400', ...PROTECTED_ERRORS),
          },
        },
      },
      '/meta/filters': {
        get: {
          tags: ['Meta'],
          summary: 'Filter dropdown options',
          description: 'Cached privately for 5 minutes.',
          responses: { 200: { description: 'Options', ...json(S.dataOf(S.filterOptions)) }, ...errors(...PROTECTED_ERRORS) },
        },
      },
      '/health': {
        servers: [{ url: '/api' }],
        get: {
          tags: ['System'],
          summary: 'Liveness check',
          security: [],
          responses: { 200: { description: 'The API process is up', ...json(S.health) } },
        },
      },
    },
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: SESSION_COOKIE,
          description: 'Set by `POST /auth/login`. HttpOnly, so the browser manages it; you never paste it manually.',
        },
      },
      schemas: componentSchemas(),
      responses: {
        400: { description: 'Validation failed, malformed JSON or invalid id', ...json(S.errorBody) },
        401: { description: 'Not logged in, invalid credentials or session revoked', ...json(S.errorBody) },
        403: { description: 'Request came from an origin that is not allowed', ...json(S.errorBody) },
        404: { description: 'Resource not found', ...json(S.errorBody) },
        409: { description: 'Duplicate value (e.g. email already in use)', ...json(S.errorBody) },
        413: { description: 'Request body larger than 10 KB', ...json(S.errorBody) },
        415: { description: 'Body is not application/json', ...json(S.errorBody) },
        429: { description: 'Too many requests or account temporarily locked', ...json(S.errorBody) },
        500: { description: 'Unexpected server error (details are logged, never returned)', ...json(S.errorBody) },
      },
    },
  };
}

let cached: ReturnType<typeof buildOpenApiDocument> | undefined;
export const getOpenApiDocument = () => (cached ??= buildOpenApiDocument());
