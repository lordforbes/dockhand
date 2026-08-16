import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listServices, createService, EnvironmentNotFoundError, DockerConnectionError } from '$lib/server/docker';
import { authorize } from '$lib/server/authorize';
import { auditSwarmService } from '$lib/server/audit';

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
		const services = await listServices(envIdNum);
		return json(services);
	} catch (error) {
		if (error instanceof EnvironmentNotFoundError) {
			return json({ error: 'Environment not found' }, { status: 404 });
		}
		if (!(error instanceof DockerConnectionError)) {
			console.error('Failed to list swarm services:', error);
		}
		return json({ error: 'Failed to list swarm services' }, { status: 500 });
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
		const spec = await request.json();

		if (!spec.Name) {
			return json({ error: 'Service name (Name) is required' }, { status: 400 });
		}

		const result = await createService(spec, envIdNum);

		await auditSwarmService(event, 'create', result.ID, spec.Name, envIdNum, {
			image: spec.TaskTemplate?.ContainerSpec?.Image
		});

		return json({ success: true, id: result.ID });
	} catch (error: any) {
		console.error('Failed to create swarm service:', error);
		return json({
			error: 'Failed to create swarm service',
			details: error.message || String(error)
		}, { status: 500 });
	}
};
