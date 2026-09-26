import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { createAuthConfig } from '../../../../../auth.config';
import { canEditRoom, createEditorToken } from '@subathon-goal-tracker/messages/access';

export const prerender = false;
export const GET: APIRoute = async ({request,params,locals}) => {
  const session = await getSession(request, createAuthConfig(locals.runtime.env));
  const room = params.streamer?.toLowerCase() ?? '';
  // Auth.js obtains this name from Twitch's signed OIDC preferred_username claim.
  const login = session?.user?.name?.toLowerCase() ?? '';
  if (!session) return new Response('Sign in to Twitch to edit this tracker.', {status:401});
  if (!login || !canEditRoom(room,login)) return new Response('Only the broadcaster and named editors can edit this tracker.', {status:403});
  const token = await createEditorToken(locals.runtime.env.EDITOR_SECRET,room,login);
  return Response.json({token},{headers:{'Cache-Control':'no-store'}});
};
