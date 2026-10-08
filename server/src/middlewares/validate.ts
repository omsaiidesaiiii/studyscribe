import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

// Express 5 exposes req.query through a getter-only accessor on the request
// prototype, so assigning to it (as Express 4 code used to) throws in strict
// mode. Validated query params are therefore stored on a separate property and
// routes read them from there.
export type ValidatedRequest<T> = Request & { validatedQuery?: T };

export function validate(schema: ZodType, source: "body" | "query" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const dataToValidate = source === "query" ? req.query : req.body;
    const result = schema.safeParse(dataToValidate);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: result.error.flatten(),
      });
    }

    if (source === "query") {
      (req as ValidatedRequest<unknown>).validatedQuery = result.data;
    } else {
      req.body = result.data;
    }

    next();
  };
}
