import type { APIRoute } from 'astro';
import { Auth } from '@auth/core';
import { env } from 'cloudflare:workers';
import { createAuthConfig } from '../../../../auth.config';

export const prerender = false;
export const GET: APIRoute = ({request}) => Auth(request, createAuthConfig(env));
export const POST = GET;
