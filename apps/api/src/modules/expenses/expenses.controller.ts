import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Expenses')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller()
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  // ============ CATEGORIES ============

  @Get('expense-categories')
  findAllCategories() {
    return this.service.findAllCategories();
  }

  @Get('expense-categories/active')
  findActiveCategories() {
    return this.service.findActiveCategories();
  }

  @Post('expense-categories')
  createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.createCategory(dto, user);
  }

  @Patch('expense-categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: Partial<CreateExpenseCategoryDto>,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.updateCategory(id, dto, user);
  }

  @Patch('expense-categories/:id/toggle-active')
  toggleCategoryActive(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.toggleCategoryActive(id, user);
  }

  // ============ EXPENSES ============

  @Get('expenses')
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findAll({ categoryId, from, to, search, page, limit });
  }

  @Get('expenses/summary')
  getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getSummary({ from, to });
  }

  @Get('expenses/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('expenses')
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Patch('expenses/:id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateExpenseDto>,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete('expenses/:id')
  delete(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.delete(id, user);
  }
}
