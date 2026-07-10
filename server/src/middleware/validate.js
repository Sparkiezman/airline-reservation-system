'use strict';

/**
 * Wraps a zod schema into Express middleware. Validates body/params/query
 * and replaces them with the parsed (typed + trimmed) values, so downstream
 * handlers never touch raw, unvalidated user input.
 */
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse({
            body: req.body,
            params: req.params,
            query: req.query
        });

        if (!result.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: result.error.issues.map((i) => ({
                    path: i.path.join('.'),
                    message: i.message
                }))
            });
        }

        if (result.data.body) req.body = result.data.body;
        if (result.data.params) req.params = result.data.params;
        if (result.data.query) req.query = result.data.query;
        next();
    };
}

module.exports = validate;
