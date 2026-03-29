import { Test, TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { ChatGateway } from 'src/chat/chat.gateway';

describe('MessagesController', () => {
  let controller: MessagesController;

  const messagesServiceMock = {
    getGlobalRoomMessages: jest.fn(),
    createMessage: jest.fn(),
  };

  const cloudinaryServiceMock = {
    isReady: jest.fn().mockReturnValue(false),
    uploadChatVoice: jest.fn(),
  };

  const chatGatewayMock = {
    broadcastNewChatMessage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        {
          provide: MessagesService,
          useValue: messagesServiceMock,
        },
        {
          provide: CloudinaryService,
          useValue: cloudinaryServiceMock,
        },
        {
          provide: ChatGateway,
          useValue: chatGatewayMock,
        },
      ],
    }).compile();

    controller = module.get<MessagesController>(MessagesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
