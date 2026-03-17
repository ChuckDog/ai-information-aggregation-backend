import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsNotEmpty,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  urls?: string[];

  @IsString()
  @IsOptional()
  keywords?: string;

  @IsString()
  @IsNotEmpty()
  instructions: string;

  @IsString()
  @IsOptional()
  structuringInstructions?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsString()
  @IsOptional()
  cronExpression?: string;

  @IsString()
  @IsOptional()
  scheduleDescription?: string;

  @IsOptional()
  isScheduled?: boolean;
}
