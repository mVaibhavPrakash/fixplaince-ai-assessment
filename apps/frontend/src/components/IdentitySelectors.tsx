import { useOrganization } from '../context/RootContext';

export function IdentitySelectors() {
    const model = useOrganization();
    const { organizations, organization } = model;
    return (
        <div className="identity-controls">
            <label>
                Organization
                <select
                    value={model.identity.organizationId}
                    onChange={(event) => model.selectOrganization(event.target.value)}
                    disabled={!organizations.length}
                >
                    {!organizations.length && <option value="">Select organization</option>}
                    {organizations.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.name}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Viewing as
                <select
                    value={model.identity.userId}
                    onChange={(event) => model.selectUser(event.target.value)}
                    disabled={!organization?.members.length}
                >
                    {!organization?.members.length && <option value="">No active users</option>}
                    {organization?.members.map((member) => (
                        <option key={member.user.id} value={member.user.id}>
                            {member.user.displayName}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}
