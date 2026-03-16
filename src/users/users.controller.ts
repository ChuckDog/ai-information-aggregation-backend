import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard } from '../auth/auth.guard';
import { User } from './entities/user.entity';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Access denied');
    }
    const [users, total] = await this.usersService.findAll(+page, +limit);
    const sanitizedUsers = users.map((user) => {
      const { password, refreshTokenHash, ...result } = user;
      return result;
    });
    return { data: sanitizedUsers, total, page: +page, limit: +limit };
  }

  @Post()
  async create(@Request() req, @Body() createUserDto: CreateUserDto & { role?: 'admin' | 'user'; isActive?: boolean }) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Access denied');
    }
    const user = await this.usersService.create(createUserDto);
    // If role/isActive provided, update them separately as create() only handles CreateUserDto fields in its signature?
    // Wait, usersService.create takes Partial<User>.
    // So if createUserDto contains role/isActive, they will be passed.
    // However, CreateUserDto type doesn't have them.
    // But the object passed at runtime does.
    // Let's verify usersService.create implementation again.
    // It spreads ...user. So yes, it works.
    
    const { password, refreshTokenHash, ...result } = user;
    return result;
  }

  @Patch(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateData: Partial<User>,
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Access denied');
    }
    
    // Allow updating role and isActive specifically
    const allowedUpdates: Partial<User> = {};
    if (updateData.role) allowedUpdates.role = updateData.role;
    if (updateData.isActive !== undefined) allowedUpdates.isActive = updateData.isActive;
    if (updateData.name) allowedUpdates.name = updateData.name;
    // Password update logic if needed
    // if (updateData.password) ...

    if (Object.keys(allowedUpdates).length > 0) {
        await this.usersService.update(id, allowedUpdates);
    }
    
    const updatedUser = await this.usersService.findById(id);
    const { password, refreshTokenHash, ...result } = updatedUser;
    return result;
  }
}
