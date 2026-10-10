import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class NoOpAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Ponto de extensão para futura implementação de Identity Provider (OIDC / Keycloak)
    return true; 
  }
}
