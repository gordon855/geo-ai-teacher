"""21.3 classroom speech adapter. Website supplies approved lesson text.
No LLM request and no extra course/API key. Existing CosyVoice and LiteAvatar handle speech.
"""
from chat_engine.common import handler_base as hb
from chat_engine.contexts.handler_context import HandlerContext
from chat_engine.data_models.chat_data_type import ChatDataType
from chat_engine.data_models.chat_engine_config_data import HandlerBaseConfigModel
from chat_engine.data_models.chat_stream_config import ChatStreamConfig
from chat_engine.data_models.runtime_data.data_bundle import DataBundle, DataBundleDefinition, DataBundleEntry

PREFIX = "[[TEACHER213]]"

def speech_text(value):
    if not isinstance(value, str) or not value.startswith(PREFIX):
        raise ValueError("请通过网站21.3课堂模式发送讲解文本")
    value = value[len(PREFIX):].strip()
    if not value or len(value) > 3000:
        raise ValueError("课堂语音文本长度应为1至3000字符")
    return value

class TeacherEcho(hb.HandlerBase):
    def get_handler_info(self):
        return hb.HandlerBaseInfo(config_model=HandlerBaseConfigModel)

    def load(self, engine_config, handler_config=None):
        pass

    def create_context(self, session_context, handler_config=None):
        context = HandlerContext(session_context.session_info.session_id)
        context.teacher_text = ""
        return context

    def start_context(self, session_context, handler_context):
        pass

    def get_handler_detail(self, session_context, context):
        definition = DataBundleDefinition()
        definition.add_entry(DataBundleEntry.create_text_entry("avatar_text"))
        return hb.HandlerDetail(
            inputs={ChatDataType.HUMAN_TEXT: hb.HandlerDataInfo(type=ChatDataType.HUMAN_TEXT)},
            outputs={ChatDataType.AVATAR_TEXT: hb.HandlerDataInfo(type=ChatDataType.AVATAR_TEXT, definition=definition)},
        )

    def handle(self, context, inputs, output_definitions):
        if inputs.type != ChatDataType.HUMAN_TEXT:
            return
        value = inputs.data.get_main_data()
        if isinstance(value, str):
            context.teacher_text += value
        if len(context.teacher_text) > 3100:
            context.teacher_text = ""
            raise ValueError("课堂语音文本过长")
        if not inputs.is_last_data:
            return
        value, context.teacher_text = context.teacher_text, ""
        text = speech_text(value)
        streamer = context.data_submitter.get_streamer(ChatDataType.AVATAR_TEXT)
        streamer.new_stream(sources=[inputs.stream_id], name="teacher213", config=ChatStreamConfig(cancelable=True))
        bundle = DataBundle(output_definitions[ChatDataType.AVATAR_TEXT].definition)
        bundle.set_main_data(text)
        streamer.stream_data(bundle, finish_stream=True)

    def destroy_context(self, context):
        context.teacher_text = ""
