import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	inspectNode,
	updateNode,
	removeNode,
	EnvironmentNotFoundError,
	DockerConnectionError,
	type UpdateNodeOptions
} from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditSwarmNode } from '$lib/server/audit';
import { validateDockerIdParam } from '$lib/server/docker-validation';

export const GET: RequestHandler = async ({ url, params, cookies }) => {
	const invalid = validateDockerIdParam(params.id!, 'node');
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
		const node = await inspectNode(params.id!, envIdNum);
		return json(node);
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to inspect swarm node:', error);
		}
		return json({ error: 'Failed to inspect swarm node' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { url, params, request, cookies } = event;
	const invalid = validateDockerIdParam(params.id!, 'node');
	if (invalid) return invalid;

	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'manage', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		const body = await request.json();

		if (typeof body.version !== 'number') {
			return json({ error: 'version is required' }, { status: 400 });
		}

		const options: UpdateNodeOptions = {
			name: body.name,
			role: body.role,
			availability: body.availability,
			labels: body.labels
		};

		await updateNode(params.id!, options, body.version, envIdNum);

		await auditSwarmNode(event, 'update', params.id!, body.name || params.id!, envIdNum, options);

		return json({ success: true });
	} catch (error: any) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to update swarm node:', error);
		}
		return json({
			error: 'Failed to update swarm node',
			details: error.message || String(error)
		}, { status: 500 });
	}
};

export const DELETE: RequestHandler = async (event) => {
	const { url, params, cookies } = event;
	const invalid = validateDockerIdParam(params.id!, 'node');
	if (invalid) return invalid;

	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;
	const force = url.searchParams.get('force') === 'true';

	if (auth.authEnabled && !await auth.can('swarm', 'manage', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		await removeNode(params.id!, force, envIdNum);

		await auditSwarmNode(event, 'delete', params.id!, params.id!, envIdNum, { force });

		return json({ success: true });
	} catch (error: any) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to remove swarm node:', error);
		}
		return json({
			error: 'Failed to remove swarm node',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
