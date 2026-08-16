import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { inspectSecret, removeSecret, EnvironmentNotFoundError, DockerConnectionError } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditSwarmSecret } from '$lib/server/audit';
import { validateDockerIdParam } from '$lib/server/docker-validation';

export const GET: RequestHandler = async ({ url, params, cookies }) => {
	const invalid = validateDockerIdParam(params.id!, 'secret');
	if (invalid) return invalid;

	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'view', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		// Docker never returns Data for secrets, only Spec metadata (Name/Labels).
		const secret = await inspectSecret(params.id!, envIdNum);
		return json(secret);
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to inspect swarm secret:', error);
		}
		return json({ error: 'Failed to inspect swarm secret' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { url, params, cookies } = event;
	const invalid = validateDockerIdParam(params.id!, 'secret');
	if (invalid) return invalid;

	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'delete', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		await removeSecret(params.id!, envIdNum);

		await auditSwarmSecret(event, 'delete', params.id!, params.id!, envIdNum);

		return json({ success: true });
	} catch (error: any) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to remove swarm secret:', error);
		}
		return json({
			error: 'Failed to remove swarm secret',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
