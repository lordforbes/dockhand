import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	inspectService,
	updateService,
	removeService,
	EnvironmentNotFoundError,
	DockerConnectionError
} from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditSwarmService } from '$lib/server/audit';
import { validateDockerIdParam } from '$lib/server/docker-validation';

export const GET: RequestHandler = async ({ url, params, cookies }) => {
	const invalid = validateDockerIdParam(params.id!, 'service');
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
		const service = await inspectService(params.id!, envIdNum);
		return json(service);
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to inspect swarm service:', error);
		}
		return json({ error: 'Failed to inspect swarm service' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { url, params, request, cookies } = event;
	const invalid = validateDockerIdParam(params.id!, 'service');
	if (invalid) return invalid;

	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'edit', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		const body = await request.json();

		if (typeof body.version !== 'number' || !body.spec) {
			return json({ error: 'version and spec are required' }, { status: 400 });
		}

		await updateService(params.id!, body.spec, body.version, envIdNum);

		await auditSwarmService(event, 'update', params.id!, body.spec.Name || params.id!, envIdNum, {
			image: body.spec.TaskTemplate?.ContainerSpec?.Image
		});

		return json({ success: true });
	} catch (error: any) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to update swarm service:', error);
		}
		return json({
			error: 'Failed to update swarm service',
			details: error.message || String(error)
		}, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { url, params, cookies } = event;
	const invalid = validateDockerIdParam(params.id!, 'service');
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
		await removeService(params.id!, envIdNum);

		await auditSwarmService(event, 'delete', params.id!, params.id!, envIdNum);

		return json({ success: true });
	} catch (error: any) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to remove swarm service:', error);
		}
		return json({
			error: 'Failed to remove swarm service',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
