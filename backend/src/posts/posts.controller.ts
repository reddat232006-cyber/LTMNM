import { Controller, Get, Post as HttpPost, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { PostCategory } from './schemas/post.schema';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Blog / Posts - Thông báo cập nhật & Tin tức')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách bài viết Blog & Thông báo cập nhật mới' })
  findAll(@Query('category') category?: string) {
    return this.postsService.findAll(category);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một bài viết Blog (tự động tăng lượt xem)' })
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }

  @HttpPost()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Đăng bài viết Blog / Thông báo cập nhật mới' })
  create(
    @Body()
    body: {
      title: string;
      summary: string;
      content: string;
      category?: PostCategory;
      coverImage?: string;
      isPinned?: boolean;
    },
    @CurrentUser('fullName') fullName: string,
  ) {
    return this.postsService.create({
      title: body.title,
      summary: body.summary,
      content: body.content,
      category: body.category || PostCategory.CAP_NHAT,
      coverImage:
        body.coverImage ||
        'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
      authorName: fullName || 'Quản Trị Viên SVTrọ',
      isPinned: !!body.isPinned,
    });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Xóa bài viết Blog' })
  remove(@Param('id') id: string) {
    return this.postsService.remove(id);
  }

  @HttpPost(':id/like')
  @ApiOperation({ summary: 'Thả tim / Đánh dấu hữu ích cho bài viết Blog' })
  likePost(@Param('id') id: string) {
    return this.postsService.likePost(id);
  }

  @HttpPost(':id/comments')
  @ApiOperation({ summary: 'Gửi bình luận cộng đồng dưới bài viết Blog' })
  addComment(
    @Param('id') id: string,
    @Body() body: { authorName: string; authorRole?: string; content: string },
  ) {
    return this.postsService.addComment(id, body);
  }
}
