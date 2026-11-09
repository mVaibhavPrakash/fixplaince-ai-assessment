import { api as defaultApi } from './api';
import type { BoardApi } from './types';
import { RootProvider } from './context/RootContext';
import { TaskBoardPage } from './components/TaskBoardPage';
import './styles/global.css';
import './styles/layout.css';

export function App({ api = defaultApi }: { api?: BoardApi }) {
    return (
        <RootProvider api={api}>
            <TaskBoardPage />
        </RootProvider>
    );
}
