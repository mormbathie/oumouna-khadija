jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { AccountSecurityService } from './account-security.service';

describe('Account security', () => {
  const config = { get: (key: string) => ({ CORS_ORIGINS: 'https://oumounakhadidja-academie.com', KEYCLOAK_CLIENT_ID: 'oumouna-khadija-app' }[key]) } as unknown as ConfigService;
  it('sends a short-lived password action only to an exact enabled account', async () => {
    const service = new AccountSecurityService(config);
    const request = jest.spyOn(service as any, 'request').mockResolvedValueOnce([{ id: 'u1', enabled: true, email: 'awa@example.com' }]).mockResolvedValue(undefined);
    await service.forgotPassword('awa@example.com', 'test-ip');
    expect(request).toHaveBeenLastCalledWith('/users/u1/execute-actions-email?lifespan=900&client_id=oumouna-khadija-app&redirect_uri=https%3A%2F%2Foumounakhadidja-academie.com%2Flogin', ['UPDATE_PASSWORD']);
  });
  it('returns the same message for unknown and disabled accounts and throttles repeated requests', async () => {
    const service = new AccountSecurityService(config);
    const request = jest.spyOn(service as any, 'request').mockResolvedValue([]);
    const absent = await service.forgotPassword('awa@example.com', 'test-ip');
    request.mockResolvedValue([{ id: 'u1', enabled: false, email: 'awa@example.com' }]);
    expect(await service.forgotPassword('awa@example.com', 'test-ip')).toEqual(absent);
    expect(await service.forgotPassword('awa@example.com', 'test-ip')).toEqual(absent);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not enroll an unverified mailbox', async () => {
    const service = new AccountSecurityService(config);
    jest.spyOn(service as any, 'request').mockResolvedValue({ emailVerified: false });
    await expect(service.enroll('u1')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('keeps configured second factors and sends enrollment only when absent', async () => {
    const service = new AccountSecurityService(config);
    const request = jest.spyOn(service as any, 'request').mockResolvedValueOnce({ emailVerified: true }).mockResolvedValueOnce([{ type: 'otp' }]);
    expect(await service.enroll('u1')).toEqual({ enabled: true, sent: false });
    request.mockResolvedValueOnce({ emailVerified: true }).mockResolvedValueOnce([]).mockResolvedValueOnce(undefined);
    expect(await service.enroll('u1')).toEqual({ enabled: false, sent: true });
    expect(request).toHaveBeenLastCalledWith(expect.stringContaining('/users/u1/execute-actions-email?'), ['CONFIGURE_TOTP']);
  });
});
