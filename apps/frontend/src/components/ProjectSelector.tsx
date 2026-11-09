import { useWorkspace } from '../context/RootContext';

export function ProjectSelector() {
    const model = useWorkspace();
    if (!model.workspace?.projects.length) {
        return null;
    }
    return (
        <div className="project-row">
            <label>
                Project
                <select
                    value={model.projectId}
                    onChange={(event) => model.selectProject(event.target.value)}
                >
                    {model.workspace.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                            {project.name}
                        </option>
                    ))}
                </select>
            </label>
            <span className="subtle">{model.workspace.settings.timeZone}</span>
        </div>
    );
}
