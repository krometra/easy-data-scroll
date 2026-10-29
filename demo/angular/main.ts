import '@angular/compiler'
import '../shared/chat.css'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  provideZonelessChangeDetection,
  ViewChild,
  type AfterViewInit,
  type OnDestroy,
} from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { InfinityScroll } from '@krometra/easy-data-scroll'
import { angularRenderer } from '@krometra/easy-data-scroll/angular'
import { ME, type Message as Msg } from '../shared/backend'
import { dayLabel, imageUrl, initials, timeOf } from '../shared/message'
import { chatShell } from '../shared/shell'

@Component({
  selector: 'chat-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'class': 'msg', '[attr.data-id]': 'item.id', 'style': 'display:block' },
  template: `
    @let m = item;
    @if (m.day) {
      <div class="day"><span>{{ day }}</span></div>
    }
    <div class="row" [class.mine]="mine" [class.first]="m.first">
      @if (!mine) {
        @if (head) {
          <div class="avatar" [style.--c]="m.user.color">{{ ini }}</div>
        } @else {
          <div class="avatar-gap"></div>
        }
      }
      <div class="bubble">
        @if (head) {
          <div class="author" [style.--c]="m.user.color">{{ m.user.name }}</div>
        }
        @if (m.reply; as r) {
          <a class="reply" [attr.href]="'#' + r.id" [attr.data-reply]="r.id" [style.--c]="r.user.color"><b>{{ r.user.name }}</b><span>{{ r.text }}</span></a>
        }
        @if (m.image) {
          <img class="photo" alt="" [src]="img">
        }
        <div class="text" [class.collapsed]="m.long">{{ m.text }}</div>
        @if (m.long) {
          <button class="more" type="button">Показать полностью</button>
        }
        @if (m.code) {
          <pre class="code">{{ m.code }}</pre>
        }
        <div class="meta">
          @if (reactions.length) {
            <div class="reactions">
              @for (r of reactions; track r[0]) {
                <span class="reaction">{{ r[0] }} {{ r[1] }}</span>
              }
            </div>
          }
          <span class="num">#{{ m.id }}</span><time>{{ time }}</time>
        </div>
      </div>
    </div>
  `,
})
class MessageComponent {
  @Input({ required: true }) item!: Msg

  get mine() { return this.item.user.id === ME.id }
  get head() { return this.item.first && !this.mine }
  get reactions() { return Object.entries(this.item.reactions) }
  get day() { return dayLabel(this.item) }
  get time() { return timeOf(this.item) }
  get ini() { return initials(this.item.user.name) }
  get img() { return imageUrl(this.item) }
}

@Component({
  selector: 'chat-app',
  template: '<div #list class="list"></div>',
})
class ChatApp implements AfterViewInit, OnDestroy {
  @ViewChild('list', { static: true }) private host!: ElementRef<HTMLElement>
  private readonly renderer = angularRenderer(MessageComponent)
  private readonly shell = chatShell()
  private list?: InfinityScroll<Msg>

  ngAfterViewInit(): void {
    this.list = new InfinityScroll(this.host.nativeElement, {
      ...this.renderer,
      origin: 'bottom',
      getKey: this.shell.getKey,
      loadBefore: this.shell.loadBefore,
      loadAfter: this.shell.loadAfter,
      onStickChange: this.shell.onStick,
    })
    this.shell.attach(this.list)
  }

  ngOnDestroy(): void {
    this.list?.destroy()
  }
}

bootstrapApplication(ChatApp, { providers: [provideZonelessChangeDetection()] })
