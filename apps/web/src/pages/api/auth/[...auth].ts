import type { APIRoute } from 'astro';
import { AstroAuth } from 'auth-astro/server';
import { createAuthConfig } from '../../../../auth.config';

export const prerender = false;
export const GET: APIRoute = async context => await AstroAuth(createAuthConfig(context.locals.runtime.env)).GET(context) ?? new Response('Not found',{status:404});
export const POST: APIRoute = async context => await AstroAuth(createAuthConfig(context.locals.runtime.env)).POST(context) ?? new Response('Not found',{status:404});
