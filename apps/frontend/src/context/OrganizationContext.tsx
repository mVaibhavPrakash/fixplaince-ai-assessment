import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BoardApi, Organization } from '../types';
import { errorMessage, type Remote } from './state';

function useOrganizationState(api: BoardApi) {
    const [directory, setDirectory] = useState<Remote<Organization[]>>({
        data: null,
        loading: true,
        error: null,
    });

    const [identity, setIdentity] = useState({ organizationId: '', userId: '' });
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setDirectory({ data: null, loading: true, error: null });
        api.organizations(controller.signal)
            .then((data) => {
                if (controller.signal.aborted) {
                    return;
                }

                const organizations = data.map((organization) => ({
                    ...organization,
                    members: organization.members.filter(
                        (member) => member.isActive && member.user.isActive
                    ),
                }));

                setDirectory({ data: organizations, loading: false, error: null });
                setIdentity({
                    organizationId: organizations[0]?.id ?? '',
                    userId: organizations[0]?.members[0]?.user.id ?? '',
                });
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    setDirectory({ data: null, loading: false, error: errorMessage(error) });
                }
            });
        return () => controller.abort();
    }, [api, revision]);
    const organizations = directory.data ?? [];
    const organization = organizations.find((item) => item.id === identity.organizationId);

    function selectOrganization(organizationId: string) {
        const selected = organizations.find((item) => item.id === organizationId);
        setIdentity({ organizationId, userId: selected?.members[0]?.user.id ?? '' });
    }

    return {
        directory,
        organizations,
        organization,
        identity,
        selectOrganization,
        selectUser: (userId: string) => setIdentity((previous) => ({ ...previous, userId })),
        reloadDirectory: () => setRevision((value) => value + 1),
    };
}

export const OrganizationContext = createContext<ReturnType<typeof useOrganizationState> | null>(
    null
);
export function OrganizationProvider({ api, children }: { api: BoardApi; children: ReactNode }) {
    const value = useOrganizationState(api);
    return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}
export function useOrganization() {
    const context = useContext(OrganizationContext);
    if (!context) {
        throw Error('useOrganization requires OrganizationProvider');
    }
    return context;
}
