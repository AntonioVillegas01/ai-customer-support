import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type ZodTypeAny } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform<unknown> {
  constructor(private readonly schema: ZodTypeAny) {}
  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
