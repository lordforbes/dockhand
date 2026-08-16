import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { inspectConfig, removeConfig, EnvironmentNotFoundError, DockerConnectionError } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditSwarmConfig } from '$lib/server/audit';
import { validateDockerIdParam } from '$lib/server/docker-validation';

export const GET: RequestHandler = async ({ url, params, cookies }) => {
	const invalid = validateDockerIdParam(params.id!, 'config');
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
		// Unlike secrets, Docker config inspect includes Spec.Data (base64) since configs aren't sensitive.
		const config = await inspectConfig(params.id!, envIdNum);
		return json(config);
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to inspect swarm config:', error);
		}
		return json({ error: 'Failed to inspect swarm config' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { url, params, cookies } = event;
	const invalid = validateDockerIdParam(params.id!, 'config');
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
		await removeConfig(params.id!, envIdNum);

		await auditSwarmConfig(event, 'delete', params.id!, params.id!, envIdNum);

		return json({ success: true });
	} catch (error: any) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to remove swarm config:', error);
		}
		return json({
			error: 'Failed to remove swarm config',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
