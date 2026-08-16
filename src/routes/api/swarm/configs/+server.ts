import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	listConfigs,
	createConfig,
	EnvironmentNotFoundError,
	DockerConnectionError,
	type CreateConfigOptions
} from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditSwarmConfig } from '$lib/server/audit';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'view', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	if (!envIdNum) {
		return json([]);
	}

	try {
		const configs = await listConfigs(envIdNum);
		return json(configs);
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to list swarm configs:', error);
		}
		return json({ error: 'Failed to list swarm configs' }, { status: 500 });
	}
};

export const POST: RequestHandler = async (event) => {
	const { url, request, cookies } = event;
	const auth = await authorize(cookies);

	const envId = url.searchParams.get('env');
	const envIdNum = envId ? parseInt(envId) : undefined;

	if (auth.authEnabled && !await auth.can('swarm', 'create', envIdNum)) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	if (envIdNum && auth.isEnterprise && !await auth.canAccessEnvironment(envIdNum)) {
		return json({ error: 'Access denied to this environment' }, { status: 403 });
	}

	try {
		const body = await request.json();

		if (!body.name || typeof body.data !== 'string') {
			return json({ error: 'name and data are required' }, { status: 400 });
		}

		const options: CreateConfigOptions = {
			name: body.name,
			data: body.data,
			labels: body.labels || {}
		};

		const result = await createConfig(options, envIdNum);

		await auditSwarmConfig(event, 'create', result.ID, body.name, envIdNum);

		return json({ success: true, id: result.ID });
	} catch (error: any) {
		console.error('Failed to create swarm config:', error);
		return json({
			error: 'Failed to create swarm config',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
