import type { BoardService } from '../board/service.js';
import type { Row } from '../board/types.js';
export interface ResolverContext {
    board(organizationId?: string): BoardService;
    organizations(): Promise<Row[]>;
}
