import { GraphQLScalarType, Kind, valueFromASTUntyped } from 'graphql';
import { badInput } from '../board/errors.js';
import { text, type PageArgs, type Row, type TaskFilter } from '../board/types.js';
import { date } from '../board/validation.js';
import type { ResolverContext } from './types.js';

const timestamp = (value: unknown) => {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) ||
        !Number.isFinite(Date.parse(value))
    ) {
        throw badInput('Invalid UTC timestamp');
    }
    return value;
};

const jsonObject = (value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw badInput('Expected a JSON object');
    }
    return value;
};

export const resolvers = {
    Date: new GraphQLScalarType({
        name: 'Date',
        serialize: date,
        parseValue: date,
        parseLiteral: (ast) =>
            ast.kind === Kind.STRING
                ? date(ast.value)
                : (() => {
                      throw badInput('Expected a date string');
                  })(),
    }),
    DateTime: new GraphQLScalarType({
        name: 'DateTime',
        serialize: timestamp,
        parseValue: timestamp,
        parseLiteral: (ast) =>
            ast.kind === Kind.STRING
                ? timestamp(ast.value)
                : (() => {
                      throw badInput('Expected a timestamp string');
                  })(),
    }),
    JSON: new GraphQLScalarType({
        name: 'JSON',
        serialize: jsonObject,
        parseValue: jsonObject,
        parseLiteral: (ast, variables) => jsonObject(valueFromASTUntyped(ast, variables)),
    }),
    Query: {
        organizations: (_: unknown, _args: unknown, context: ResolverContext) =>
            context.organizations(),
        organization: (_: unknown, _args: unknown, context: ResolverContext) =>
            context.board().organization(),
        task: (_: unknown, args: { id: string }, context: ResolverContext) =>
            context.board().task(args.id),
        tasks: (
            _: unknown,
            args: PageArgs & { projectId: string; filter?: TaskFilter },
            context: ResolverContext
        ) => context.board().tasks(args.projectId, args.filter, args),
        taskSummary: (
            _: unknown,
            args: { projectId: string; filter?: TaskFilter },
            context: ResolverContext
        ) => context.board().summary(args.projectId, args.filter),
    },
    Organization: {
        settings: async (row: Row, _args: unknown, context: ResolverContext) => {
            const organization = await context.board(text(row, 'id')).organization();
            return { timeZone: organization.time_zone, preferences: organization.preferences };
        },
        members: (row: Row, _args: unknown, context: ResolverContext) =>
            row.members ?? context.board(text(row, 'id')).members(),
        projects: (row: Row, _args: unknown, context: ResolverContext) =>
            context.board(text(row, 'id')).projects(),
    },
    OrganizationMember: {
        role: async (row: Row, _args: unknown, context: ResolverContext) => {
            const board = context.board(text(row, 'organization_id'));
            const member = row.role ? row : await board.member(text(row, 'user_id'));
            return member ? text(member, 'role').toUpperCase() : null;
        },
        isActive: (row: Row) => row.is_active,
        user: (row: Row, _args: unknown, context: ResolverContext) =>
            row.user ?? context.board(text(row, 'organization_id')).user(text(row, 'user_id')),
    },
    User: {
        displayName: (row: Row) => row.display_name,
        isActive: (row: Row) => row.is_active,
    },
    Project: {
        organizationId: (row: Row) => row.organization_id,
        statuses: (row: Row, _args: unknown, context: ResolverContext) =>
            context.board().statuses(text(row, 'id')),
        labels: (row: Row, _args: unknown, context: ResolverContext) =>
            context.board().labels(text(row, 'id')),
    },
    TaskStatus: { isDone: (row: Row) => row.is_done },
    Task: {
        organizationId: (row: Row) => row.organization_id,
        projectId: (row: Row) => row.project_id,
        dueDate: (row: Row) => row.due_date,
        createdAt: (row: Row) => row.created_at,
        updatedAt: (row: Row) => row.updated_at,
        assignee: (row: Row, _args: unknown, context: ResolverContext) =>
            row.assignee_id == null ? null : context.board().member(text(row, 'assignee_id')),
        createdBy: (row: Row, _args: unknown, context: ResolverContext) =>
            context.board().user(text(row, 'created_by')),
        status: (row: Row, _args: unknown, context: ResolverContext) =>
            context.board().status(text(row, 'project_id'), text(row, 'status_id')),
        labels: (row: Row, _args: unknown, context: ResolverContext) =>
            context.board().taskLabels(text(row, 'id')),
        comments: (row: Row, args: PageArgs, context: ResolverContext) =>
            context.board().history('comments', text(row, 'id'), args),
        activity: (row: Row, args: PageArgs, context: ResolverContext) =>
            context.board().history('activity', text(row, 'id'), args),
    },
    TaskComment: {
        createdAt: (row: Row) => row.created_at,
        updatedAt: (row: Row) => row.updated_at,
        author: (row: Row, _args: unknown, context: ResolverContext) =>
            context.board().user(text(row, 'author_id')),
    },
    TaskActivity: {
        createdAt: (row: Row) => row.created_at,
        actor: (row: Row, _args: unknown, context: ResolverContext) =>
            context.board().user(text(row, 'actor_id')),
    },
};
